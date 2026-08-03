import type { PetSnapshot, ProviderId, QuotaSnapshot } from "@amnis/shared";
import { useEffect, useRef, useState } from "react";
import { daemonUrl } from "../../api/config.ts";
import type { ConnectionStatus } from "../../api/useAmnisStream.ts";
import { formatElapsed } from "../../lib/countdown.ts";
import { Pet, PetOffline, STATE_TITLE } from "../../lib/Pet/Pet.tsx";
import { QuotaRing } from "../dashboard/QuotaRing.tsx";
import styles from "./QuotaPanel.module.css";

/** Lista indexada por proveedor aunque hoy solo exista Claude — mismo
 * criterio que `account_id` (issue #42): barato en la estructura, caro
 * como refactorización si se añade Antigravity más tarde. */
const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: "Claude",
};

const RING_SIZE = 54;

/** Mismos tonos que llevaba el `statusDot` que se quitó de
 * `PetWindow.tsx`: aquí vive dentro del panel desplegado, no flotando
 * siempre visible encima de la mascota. */
const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: "#1FB98C",
  reconnecting: "#e0b84a",
  offline: "#b0b0b0",
};

/** Si no llega un `quota` fresco por SSE en este tiempo (endpoint caído,
 * 429, offline), el icono deja de girar solo — un fallo de red no debe
 * dejarlo animando para siempre. */
const REFRESH_TIMEOUT_MS = 8_000;

export interface QuotaPanelProps {
  pet: PetSnapshot;
  status: ConnectionStatus;
  quotas: QuotaSnapshot[];
  now: Date;
}

/**
 * Panel desplegable de la ventana flotante (issue #42), diseño 3b: BIT
 * pequeño junto al texto de actividad en vez de a tamaño completo
 * arriba, y los anillos 5h/7d en fila con el 7d atenuado — la
 * jerarquía (qué manda, qué acompaña) se lee sin leer.
 */
export function QuotaPanel({ pet, status, quotas, now }: QuotaPanelProps) {
  const [refreshing, setRefreshing] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Cualquier `quota` fresco (el nuestro o el del siguiente tick de los
  // 180s) apaga el spinner — no hace falta correlacionar cuál lo trajo.
  // Sin array de dependencias (corre en cada render) porque el propio
  // valor a vigilar es la referencia de `quotas`, que no se lee dentro
  // del efecto — un array de deps con algo que no se usa es justo lo
  // que `useExhaustiveDependencies` rechaza.
  const prevQuotasRef = useRef(quotas);
  useEffect(() => {
    if (prevQuotasRef.current !== quotas) {
      setRefreshing(false);
      clearTimeout(timeoutRef.current);
      prevQuotasRef.current = quotas;
    }
  });

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  function handleRefresh() {
    setRefreshing(true);
    fetch(`${daemonUrl()}/api/quota/refresh`, { method: "POST" }).catch(
      () => {},
    );
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(
      () => setRefreshing(false),
      REFRESH_TIMEOUT_MS,
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div
          className={styles.statusDot}
          style={{ background: STATUS_COLOR[status] }}
        />
        <span className={styles.wordmark}>AMNIS</span>
      </div>

      <div className={styles.activity}>
        <div className={styles.activityPet}>
          {status === "offline" ? (
            <PetOffline />
          ) : (
            <Pet state={pet.state} level={pet.level} fatigue={pet.fatigue} />
          )}
        </div>
        <div className={styles.activityText}>
          <span className={styles.cap}>Ahora</span>
          <span className={styles.activityLabel} data-testid="activity-label">
            {STATE_TITLE[pet.state]}
          </span>
          <span
            className={styles.activityDuration}
            data-testid="activity-duration"
          >
            {formatElapsed(pet.since, now)}
          </span>
        </div>
      </div>

      {quotas.map((quota, i) => (
        <section key={quota.provider} className={styles.provider}>
          <div className={styles.providerRow}>
            <h2 className={styles.providerLabel}>
              {PROVIDER_LABEL[quota.provider]}
            </h2>
            {i === 0 && (
              <button
                type="button"
                className={styles.refreshButton}
                data-refreshing={refreshing}
                onClick={handleRefresh}
                // La ventana entera alterna plegado/desplegado con el
                // mismo gesto de clic (PetWindow.tsx) — sin cortar la
                // propagación aquí, pulsar este botón también dispara
                // ese toggle y el panel se plegaba solo al recargar.
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                disabled={refreshing}
                aria-label="Recargar cuota"
                title="Recargar cuota"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="11"
                  height="11"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M20 11a8 8 0 1 0-2.34 5.66M20 5v6h-6"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
          {quota.error && <p className={styles.error}>{quota.error}</p>}
          <div className={styles.rings}>
            <div className={styles.ringCell}>
              <QuotaRing
                label="5h"
                authoritative={quota.authoritative?.fiveHour ?? null}
                estimated={quota.local.fiveHourUtilization}
                now={now}
                size={RING_SIZE}
                layout="row"
              />
            </div>
            <div className={styles.ringCell}>
              <QuotaRing
                label="7d"
                authoritative={quota.authoritative?.sevenDay ?? null}
                estimated={null}
                now={now}
                size={RING_SIZE}
                layout="row"
                tone="muted"
              />
            </div>
            {quota.authoritative?.sevenDayOpus && (
              <div className={styles.ringCell}>
                <QuotaRing
                  label="7d Opus"
                  authoritative={quota.authoritative.sevenDayOpus}
                  estimated={null}
                  now={now}
                  size={RING_SIZE}
                  layout="row"
                  tone="muted"
                />
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
