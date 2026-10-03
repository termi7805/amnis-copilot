import type {
  HealthCheck,
  HealthResponse,
  MediaStatus,
  RepairHooksResponse,
} from "@amnis/shared";
import { Fragment, type ReactNode, useState } from "react";
import type { ActionResult } from "../../../api/actions.ts";
import {
  connectSpotify,
  disconnectSpotify,
  repairHooks,
} from "../../../api/health.ts";
import styles from "./SettingsView.module.css";

/** Los `name` de `diagnose()` son para el CLI; aquí se muestran con título. */
const TITLE: Record<string, string> = {
  daemon: "Daemon",
  hooks: "Hooks de Claude Code",
  credenciales: "Credenciales de Claude",
  token: "Sesión de Claude",
  endpoint: "Cuota de Anthropic",
  "base de datos": "Base de datos",
  ingesta: "Transcripts",
  spotify: "Spotify",
};

const START_TIME = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
});

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
  if (added.length === 0) return "No había nada que reparar.";
  return `Reparado: ${added.join(", ")}.${backup ? ` Copia en ${backup}.` : ""}`;
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
        label: "Reparar hooks",
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
          label: "Conectar",
          primary: !check.ok,
          run: async () => {
            const result = await actions.connectSpotify();
            return result.ok
              ? {
                  ok: true,
                  notice: "Autoriza a Amnis en la pestaña que se ha abierto.",
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
          label: "Desconectar",
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
      return `v${version} · en marcha desde las ${START_TIME.format(new Date(startedAt))} · ${eventsReceived.toLocaleString("es-ES")} eventos de hook`;
    }
    return check.message;
  }

  return (
    <section className={styles.card} aria-labelledby="health-title">
      <div className={styles.cardHead}>
        <h2 id="health-title">Salud</h2>
        {health && (
          <span
            className={styles.pill}
            data-tone={warnings > 0 ? "warn" : "ok"}
          >
            {warnings === 0
              ? "OK"
              : warnings === 1
                ? "1 aviso"
                : `${warnings} avisos`}
          </span>
        )}
      </div>
      {unreachable && (
        <p role="alert" className={styles.error}>
          No se pudo contactar con Amnis.
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
                  <div className={styles.title}>
                    {TITLE[check.name] ?? check.name}
                  </div>
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
