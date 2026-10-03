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
  const { state, status } = useAmnisStream();
  const view = useHashView();
  const quotaError = state?.quotas.find((q) => q.error)?.error;

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
              </a>
            </li>
          ))}
        </ul>
        <div className={styles.railStatus}>
          <p data-testid="connection-status">{CONNECTION_LABEL[status]}</p>
          {quotaError && (
            <a className={styles.health} href="#ajustes">
              Cuota: {quotaError}
            </a>
          )}
        </div>
      </nav>
      <main className={styles.main}>
        {view === "ahora" && <NowView state={state} />}
        {view === "historico" && <HistoryView state={state} />}
        {view === "actividad" && <ActivityView state={state} />}
        {view === "ajustes" && <SettingsView state={state} />}
      </main>
    </div>
  );
}
