import type { QuotaSnapshot } from "@amnis/shared";
import { QUOTA_POLL_MS } from "../config.ts";

export interface QuotaPollerDeps {
  sample(): Promise<QuotaSnapshot>;
  onSample?(snapshot: QuotaSnapshot): void;
  onError?(error: Error): void;
  intervalMs?: number;
}

/**
 * Poll periódico de cuota, con una muestra inmediata al arrancar (si no,
 * el primer dato tarda `intervalMs` y el daemon parece no hacer nada).
 *
 * Degradar es el camino normal: un rechazo de `sample()` va a `onError`
 * y el intervalo sigue vivo, nunca se detiene solo.
 *
 * Devuelve `stop()`.
 */
export function startQuotaPoller(deps: QuotaPollerDeps): () => void {
  const intervalMs = deps.intervalMs ?? QUOTA_POLL_MS;
  let inFlight = false;

  const tick = () => {
    // Guarda de solapamiento: una muestra lenta no debe apilar llamadas
    // y multiplicar la tasa real contra el endpoint (justo lo que los
    // 180s existen para evitar).
    if (inFlight) return;
    inFlight = true;
    deps
      .sample()
      .then((snapshot) => deps.onSample?.(snapshot))
      .catch((err) => deps.onError?.(err as Error))
      .finally(() => {
        inFlight = false;
      });
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}
