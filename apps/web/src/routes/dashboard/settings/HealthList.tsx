import type {
  HealthCheck,
  HealthResponse,
  MediaStatus,
  RepairHooksResponse,
} from "@amnis/shared";
import { Fragment, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionResult } from "../../../api/actions.ts";
import {
  connectSpotify,
  disconnectSpotify,
  repairHooks,
} from "../../../api/health.ts";
import { settings as settingsMessages } from "../../../i18n/es/settings.ts";
import i18n, { dateFormat, formatNumber } from "../../../i18n/index.ts";
import styles from "./SettingsView.module.css";

/** Los `name` de `diagnose()` son para el CLI; aquí se muestran con título. */
type CheckName = keyof typeof settingsMessages.health.checks;

/** Un chequeo que la web no conoce se enseña con su nombre del daemon. */
function checkTitle(name: string): string {
  return Object.hasOwn(settingsMessages.health.checks, name)
    ? i18n.t(`settings.health.checks.${name as CheckName}`)
    : name;
}

/** Los remedios traen comandos entre `backticks`: se pintan como `<code>`. */
function withCode(text: string): ReactNode {
  let offset = 0;
  return text.split("`").map((part, i) => {
    // La posición en el texto es una clave estable; el índice no lo sería.
    const key = offset;
    offset += part.length + 1;
    return i % 2 === 1 ? (
      <code key={key}>{part}</code>
    ) : (
      <Fragment key={key}>{part}</Fragment>
    );
  });
}

export interface HealthListActions {
  repairHooks: () => Promise<ActionResult<RepairHooksResponse>>;
  connectSpotify: () => Promise<ActionResult>;
  disconnectSpotify: () => Promise<ActionResult>;
}

export interface HealthListProps {
  health: HealthResponse | null;
  /** El último `GET /api/health` no llegó al daemon. */
  unreachable: boolean;
  refresh: () => void;
  /** Decide si Spotify ofrece Conectar o Desconectar. */
  mediaStatus: MediaStatus | undefined;
  actions?: HealthListActions;
}

type Outcome = { ok: true; notice?: string } | { ok: false; message: string };

interface Action {
  label: string;
  primary: boolean;
  run: () => Promise<Outcome>;
}

function describeRepair({ added, backup }: RepairHooksResponse): string {
  if (added.length === 0) return i18n.t("settings.health.nothingToRepair");
  return `${i18n.t("settings.health.repaired", { added: added.join(", ") })}${backup ? i18n.t("settings.health.backup", { backup }) : ""}`;
}

/**
 * La salud del sistema (`amnis doctor` en el navegador, #89). Cada fila que
 * puede fallar trae su remedio como botón cuando hay ruta que lo haga (reparar
 * hooks, conectar o desconectar Spotify, #90) y como texto cuando no.
 */
export function HealthList({
  health,
  unreachable,
  refresh,
  mediaStatus,
  actions = { repairHooks, connectSpotify, disconnectSpotify },
}: HealthListProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notices, setNotices] = useState<Record<string, string>>({});

  const warnings = health?.checks.filter((c) => !c.ok).length ?? 0;

  async function run(name: string, action: Action) {
    setBusy(name);
    setErrors(({ [name]: _gone, ...rest }) => rest);
    setNotices(({ [name]: _gone, ...rest }) => rest);
    const outcome = await action.run();
    setBusy(null);
    if (!outcome.ok) {
      setErrors((current) => ({ ...current, [name]: outcome.message }));
      return;
    }
    const { notice } = outcome;
    if (notice) setNotices((current) => ({ ...current, [name]: notice }));
    refresh();
  }

  function actionFor(check: HealthCheck): Action | null {
    if (check.name === "hooks" && !check.ok) {
      return {
        label: t("settings.health.repairHooks"),
        primary: true,
        run: async () => {
          const result = await actions.repairHooks();
          return result.ok
            ? { ok: true, notice: describeRepair(result.body) }
            : result;
        },
      };
    }
    if (check.name === "spotify") {
      if (mediaStatus === "not-logged-in") {
        return {
          label: t("settings.health.connect"),
          primary: !check.ok,
          run: async () => {
            const result = await actions.connectSpotify();
            return result.ok
              ? {
                  ok: true,
                  notice: t("settings.health.authorize"),
                }
              : result;
          },
        };
      }
      if (
        mediaStatus === "ok" ||
        mediaStatus === "no-device" ||
        mediaStatus === "unavailable"
      ) {
        return {
          label: t("settings.health.disconnect"),
          primary: false,
          run: async () => {
            const result = await actions.disconnectSpotify();
            return result.ok ? { ok: true } : result;
          },
        };
      }
    }
    return null;
  }

  function detailOf(check: HealthCheck): string {
    if (check.name === "daemon" && check.ok && health) {
      const { version, startedAt, eventsReceived } = health.daemon;
      return t("settings.health.daemonDetail", {
        version,
        time: dateFormat({ hour: "2-digit", minute: "2-digit" }).format(
          new Date(startedAt),
        ),
        events: formatNumber(eventsReceived),
      });
    }
    return check.message;
  }

  return (
    <section className={styles.card} aria-labelledby="health-title">
      <div className={styles.cardHead}>
        <h2 id="health-title">{t("settings.health.title")}</h2>
        {health && (
          <span
            className={styles.pill}
            data-tone={warnings > 0 ? "warn" : "ok"}
          >
            {warnings === 0
              ? t("settings.health.ok")
              : t("settings.health.warnings", { count: warnings })}
          </span>
        )}
      </div>
      {unreachable && (
        <p role="alert" className={styles.error}>
          {t("common.errors.unreachable")}
        </p>
      )}
      {health && (
        <ul className={styles.rows}>
          {health.checks.map((check) => {
            const action = actionFor(check);
            return (
              <li key={check.name} className={styles.row}>
                <span
                  className={styles.icon}
                  data-ok={check.ok}
                  aria-hidden="true"
                >
                  {check.ok ? "✓" : "!"}
                </span>
                <div>
                  <div className={styles.title}>{checkTitle(check.name)}</div>
                  <div className={styles.detail}>
                    {withCode(detailOf(check))}
                  </div>
                  {!check.ok && check.remedy && !action && (
                    <div className={styles.detail}>
                      {withCode(check.remedy)}
                    </div>
                  )}
                  {notices[check.name] && (
                    <div role="status" className={styles.notice}>
                      {notices[check.name]}
                    </div>
                  )}
                  {errors[check.name] && (
                    <div role="alert" className={styles.error}>
                      {errors[check.name]}
                    </div>
                  )}
                </div>
                {action && (
                  <button
                    type="button"
                    className={`${styles.btn} ${action.primary ? styles.primary : ""}`}
                    disabled={busy !== null}
                    onClick={() => run(check.name, action)}
                  >
                    {action.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
