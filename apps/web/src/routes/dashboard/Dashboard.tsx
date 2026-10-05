import { pendingUpdate } from "@amnis/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { postAction } from "../../api/actions.ts";
import { countWarnings, useHealth } from "../../api/health.ts";
import { useAmnisStream } from "../../api/useAmnisStream.ts";
import { useLocale } from "../../lib/locale.ts";
import { Pet } from "../../lib/Pet/Pet.tsx";
import { useSelectedSkin } from "../../lib/Pet/useSelectedSkin.ts";
import { useTheme } from "../../lib/theme.ts";
import { ActivityView } from "./activity/ActivityView.tsx";
import styles from "./Dashboard.module.css";
import { HistoryView } from "./history/HistoryView.tsx";
import { NowView } from "./now/NowView.tsx";
import { SettingsView } from "./settings/SettingsView.tsx";
import { UpdateBanner } from "./UpdateBanner.tsx";
import { useHashView, VIEWS, type View } from "./useHashView.ts";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Iconos de trazo del mockup v6: reloj, barras, pulso y deslizadores. */
const VIEW_ICON: Record<View, ReactNode> = {
  ahora: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  ),
  historico: (
    <Icon>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Icon>
  ),
  actividad: (
    <Icon>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </Icon>
  ),
  ajustes: (
    <Icon>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </Icon>
  ),
};

/**
 * Esqueleto del dashboard (#81): raíl con las cuatro vistas y `<main>` con
 * la activa. El stream SSE se abre aquí, una sola vez: dentro de cada vista,
 * cambiar de pestaña abriría y cerraría conexiones y el daemon las contaría
 * como clientes que entran y salen del sondeo rápido de Spotify.
 */
export function Dashboard() {
  const { state, status, rebuild } = useAmnisStream();
  const view = useHashView();
  // Aquí y no en Ajustes: el tema se aplica en cualquier vista, y dos
  // instancias del hook harían dos migraciones.
  const [theme, setTheme] = useTheme(state?.settings);
  const [locale, setLocale] = useLocale(state?.settings);
  const skin = useSelectedSkin(state?.settings.petSkin, state?.skins);
  const { t } = useTranslation();
  // Cada sondeo de cuota y cada cambio del estado de Spotify (conectar,
  // desconectar) pueden cambiar un chequeo: se vuelve a pedir la salud.
  const health = useHealth(
    `${state?.quotas[0]?.sampledAt ?? ""}|${state?.media.status ?? ""}`,
  );
  const warnings = countWarnings(health.health);

  return (
    <div className={styles.dashboard}>
      <nav className={styles.rail} aria-label={t("common.nav.label")}>
        <a className={styles.logo} href="#ahora">
          <span className={styles.mini} aria-hidden="true">
            {state && (
              <Pet
                state={state.pet.state}
                level={state.pet.level}
                fatigue={state.pet.fatigue}
                skin={skin}
              />
            )}
          </span>
          <span>
            Amnis<small>Copilot</small>
          </span>
        </a>
        <ul className={styles.links}>
          {VIEWS.map((id) => (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={view === id ? "page" : undefined}
              >
                {VIEW_ICON[id]}
                {t(`common.views.${id}`)}
                {id === "ajustes" && warnings > 0 && (
                  <span
                    className={styles.badge}
                    title={t("common.nav.warnings", { count: warnings })}
                    role="status"
                    aria-label={t("common.nav.warnings", { count: warnings })}
                  >
                    {warnings}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
        <div className={styles.railStatus}>
          <p>
            <span className={styles.dot} data-status={status} />
            <span data-testid="connection-status">
              {t("common.nav.daemon", {
                status: t(`common.connection.${status}`),
              })}
              {status === "connected" && state && ` · v${state.daemon.version}`}
            </span>
          </p>
          {warnings > 0 && (
            <a className={styles.health} href="#ajustes">
              {t("common.nav.warnings", { count: warnings })}
            </a>
          )}
          {/* Cierra la mascota y el daemon; tras esto el estado pasa solo a
              «sin conexión». */}
          {status === "connected" && (
            <button
              type="button"
              className={styles.quit}
              onClick={() => postAction("/api/shutdown")}
            >
              {t("common.nav.quit")}
            </button>
          )}
        </div>
      </nav>
      <main className={styles.main}>
        <UpdateBanner
          update={state ? pendingUpdate(state.update, state.settings) : null}
        />
        {view === "ahora" && <NowView state={state} />}
        {view === "historico" && <HistoryView state={state} />}
        {view === "actividad" && <ActivityView state={state} />}
        {view === "ajustes" && (
          <SettingsView
            state={state}
            health={health}
            rebuild={rebuild}
            theme={theme}
            onTheme={setTheme}
            locale={locale}
            onLocale={setLocale}
          />
        )}
      </main>
    </div>
  );
}
