import type { ReactNode } from "react";
import { countWarnings, useHealth } from "../../api/health.ts";
import { CONNECTION_LABEL, useAmnisStream } from "../../api/useAmnisStream.ts";
import { Pet } from "../../lib/Pet/Pet.tsx";
import { useTheme } from "../../lib/theme.ts";
import { ActivityView } from "./activity/ActivityView.tsx";
import styles from "./Dashboard.module.css";
import { HistoryView } from "./history/HistoryView.tsx";
import { NowView } from "./now/NowView.tsx";
import { SettingsView } from "./settings/SettingsView.tsx";
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
  // Cada sondeo de cuota y cada cambio del estado de Spotify (conectar,
  // desconectar) pueden cambiar un chequeo: se vuelve a pedir la salud.
  const health = useHealth(
    `${state?.quotas[0]?.sampledAt ?? ""}|${state?.media.status ?? ""}`,
  );
  const warnings = countWarnings(health.health);

  return (
    <div className={styles.dashboard}>
      <nav className={styles.rail} aria-label="Vistas">
        <a className={styles.logo} href="#ahora">
          <span className={styles.mini} aria-hidden="true">
            {state && (
              <Pet
                state={state.pet.state}
                level={state.pet.level}
                fatigue={state.pet.fatigue}
              />
            )}
          </span>
          <span>
            Amnis<small>Copilot</small>
          </span>
        </a>
        <ul className={styles.links}>
          {VIEWS.map(({ id, label }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={view === id ? "page" : undefined}
              >
                {VIEW_ICON[id]}
                {label}
                {id === "ajustes" && warnings > 0 && (
                  <span
                    className={styles.badge}
                    title={`${warnings} ${warnings === 1 ? "aviso" : "avisos"} de salud`}
                    role="status"
                    aria-label={`${warnings} ${warnings === 1 ? "aviso" : "avisos"} de salud`}
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
              Daemon {CONNECTION_LABEL[status]}
              {status === "connected" && state && ` · v${state.daemon.version}`}
            </span>
          </p>
          {warnings > 0 && (
            <a className={styles.health} href="#ajustes">
              {warnings} {warnings === 1 ? "aviso" : "avisos"} de salud
            </a>
          )}
        </div>
      </nav>
      <main className={styles.main}>
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
          />
        )}
      </main>
    </div>
  );
}
