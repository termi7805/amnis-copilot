import { CONNECTION_LABEL, useAmnisStream } from "../../api/useAmnisStream.ts";
import { useNow } from "../../lib/countdown.ts";
import { Pet } from "../../lib/Pet/Pet.tsx";
import styles from "./Dashboard.module.css";
import { QuotaRing } from "./QuotaRing.tsx";

/**
 * Envoltura del dashboard: tarjeta ~160px junto a los anillos de cuota
 * (docs/STACK.md §2). El relleno real —tokens y coste— llega con #31;
 * aquí solo el sitio donde encajan.
 */
export function Dashboard() {
  const { state, status } = useAmnisStream();
  const now = useNow();

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
      {state?.quotas.map((quota) => (
        <div key={quota.provider} className={styles.quotas}>
          {quota.error && <p className={styles.quotaError}>{quota.error}</p>}
          <QuotaRing
            label="5h"
            authoritative={quota.authoritative?.fiveHour ?? null}
            estimated={quota.local.fiveHourUtilization}
            now={now}
          />
          <QuotaRing
            label="7d"
            authoritative={quota.authoritative?.sevenDay ?? null}
            estimated={null}
            now={now}
          />
          {quota.authoritative?.sevenDayOpus && (
            <QuotaRing
              label="7d Opus"
              authoritative={quota.authoritative.sevenDayOpus}
              estimated={null}
              now={now}
            />
          )}
        </div>
      ))}
      <pre>{state ? JSON.stringify(state, null, 2) : null}</pre>
    </main>
  );
}
