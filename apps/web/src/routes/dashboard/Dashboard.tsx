import { countWarnings, useHealth } from "../../api/health.ts";
import { CONNECTION_LABEL, useAmnisStream } from "../../api/useAmnisStream.ts";
import { Pet } from "../../lib/Pet/Pet.tsx";
import { ActivityView } from "./activity/ActivityView.tsx";
import styles from "./Dashboard.module.css";
import { HistoryView } from "./history/HistoryView.tsx";
import { NowView } from "./now/NowView.tsx";
import { SettingsView } from "./settings/SettingsView.tsx";
import { useHashView, VIEWS } from "./useHashView.ts";

/**
 * Esqueleto del dashboard (#81): raíl con las cuatro vistas y `<main>` con
 * la activa. El stream SSE se abre aquí, una sola vez: dentro de cada vista,
 * cambiar de pestaña abriría y cerraría conexiones y el daemon las contaría
 * como clientes que entran y salen del sondeo rápido de Spotify.
 */
export function Dashboard() {
  const { state, status, rebuild } = useAmnisStream();
  const view = useHashView();
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
          <span>Amnis</span>
        </a>
        <ul className={styles.links}>
          {VIEWS.map(({ id, label }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={view === id ? "page" : undefined}
              >
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
          <p data-testid="connection-status">{CONNECTION_LABEL[status]}</p>
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
          <SettingsView state={state} health={health} rebuild={rebuild} />
        )}
      </main>
    </div>
  );
}
