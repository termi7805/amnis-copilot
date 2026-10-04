import type { QuotaSnapshot } from "@amnis/shared";
import { QUOTA_POLL_MS } from "../config.ts";

export interface QuotaPollerDeps {
  /** Recibe la última muestra: un 429 la conserva en vez de borrarla (#116). */
  sample(previous: QuotaSnapshot | null): Promise<QuotaSnapshot>;
  onSample?(snapshot: QuotaSnapshot): void;
  onError?(error: Error): void;
  intervalMs?: number;
}

export interface QuotaPoller {
  stop(): void;
  /** Fuerza una muestra ya, sin esperar al intervalo — botón de recarga
   * manual del panel de cuota. Si ya hay una en vuelo espera a esa en vez de
   * lanzar otra (no apila peticiones contra el endpoint, que es justo lo que
   * el intervalo de 180s existe para evitar). Rechaza si la muestra falla. */
  pollNow(): Promise<QuotaSnapshot>;
  /** La última muestra, o `null` antes de la primera. Nunca sondea. */
  peek(): QuotaSnapshot | null;
  /** La última muestra; antes de la primera, espera a la inicial en vez de
   * sondear por su cuenta. Es lo que lee `GET /api/state` (#116). */
  current(): Promise<QuotaSnapshot>;
}

/**
 * Poll periódico de cuota, con una muestra inmediata al arrancar (si no,
 * el primer dato tarda `intervalMs` y el daemon parece no hacer nada).
 *
 * Degradar es el camino normal: un rechazo de `sample()` va a `onError`
 * y el intervalo sigue vivo, nunca se detiene solo.
 */
export function startQuotaPoller(deps: QuotaPollerDeps): QuotaPoller {
  const intervalMs = deps.intervalMs ?? QUOTA_POLL_MS;
  let last: QuotaSnapshot | null = null;
  let inFlight: Promise<QuotaSnapshot> | null = null;

  const run = (): Promise<QuotaSnapshot> => {
    // Guarda de solapamiento: una muestra lenta no debe apilar llamadas
    // y multiplicar la tasa real contra el endpoint (justo lo que los
    // 180s existen para evitar).
    if (inFlight) return inFlight;
    const promise = deps
      .sample(last)
      .then((snapshot) => {
        last = snapshot;
        deps.onSample?.(snapshot);
        return snapshot;
      })
      .catch((err) => {
        deps.onError?.(err as Error);
        throw err;
      })
      .finally(() => {
        inFlight = null;
      });
    inFlight = promise;
    return promise;
  };

  // El rechazo ya fue a `onError`; en el tick nadie más lo espera.
  const tick = () => {
    run().catch(() => {});
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();

  return {
    stop: () => clearInterval(timer),
    pollNow: run,
    peek: () => last,
    current: () => (last ? Promise.resolve(last) : run()),
  };
}
