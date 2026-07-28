import type { ProviderId, QuotaSnapshot } from "@amnis/shared";
import { QuotaRing } from "../dashboard/QuotaRing.tsx";
import styles from "./QuotaPanel.module.css";

/** Lista indexada por proveedor aunque hoy solo exista Claude — mismo
 * criterio que `account_id` (issue #42): barato en la estructura, caro
 * como refactorización si se añade Antigravity más tarde. */
const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: "Claude",
};

const RING_SIZE = 56;

export interface QuotaPanelProps {
  quotas: QuotaSnapshot[];
  now: Date;
}

/**
 * Panel desplegable de la ventana flotante: la fatiga da el vistazo
 * ambiental, esto da la cifra sin abrir el navegador (issue #42).
 * Reutiliza `QuotaRing` del dashboard más pequeño, no barras nuevas —
 * así una caída del endpoint ("sin dato") se distingue de un consumo
 * bajo exactamente igual que en el dashboard.
 */
export function QuotaPanel({ quotas, now }: QuotaPanelProps) {
  return (
    <div className={styles.panel}>
      {quotas.map((quota) => (
        <section key={quota.provider} className={styles.provider}>
          <h2 className={styles.providerLabel}>
            {PROVIDER_LABEL[quota.provider]}
          </h2>
          {quota.error && <p className={styles.error}>{quota.error}</p>}
          <div className={styles.rings}>
            <QuotaRing
              label="5h"
              authoritative={quota.authoritative?.fiveHour ?? null}
              estimated={quota.local.fiveHourUtilization}
              now={now}
              size={RING_SIZE}
            />
            <QuotaRing
              label="7d"
              authoritative={quota.authoritative?.sevenDay ?? null}
              estimated={null}
              now={now}
              size={RING_SIZE}
            />
            {quota.authoritative?.sevenDayOpus && (
              <QuotaRing
                label="7d Opus"
                authoritative={quota.authoritative.sevenDayOpus}
                estimated={null}
                now={now}
                size={RING_SIZE}
              />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
