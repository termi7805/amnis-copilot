import { CONNECTION_LABEL, useAmnisStream } from "../../api/useAmnisStream.ts";
import { Pet } from "../../lib/Pet/Pet.tsx";
import styles from "./Dashboard.module.css";

/**
 * Envoltura del dashboard: tarjeta ~160px junto a los anillos de cuota
 * (docs/STACK.md §2). El relleno real —ventanas 5h/7d, tokens y coste—
 * llega con #30 y #31; aquí solo el sitio donde encajan.
 */
export function Dashboard() {
  const { state, status } = useAmnisStream();

  return (
    <main className={styles.dashboard}>
      <div className={styles.petCard}>
        {state ? (
          <Pet
            state={state.pet.state}
            level={state.pet.level}
            fatigue={state.pet.fatigue}
          />
        ) : (
          <span>conectando…</span>
        )}
      </div>
      <p data-testid="connection-status">{CONNECTION_LABEL[status]}</p>
      <pre>{state ? JSON.stringify(state, null, 2) : null}</pre>
    </main>
  );
}
