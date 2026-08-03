import type { QuotaSnapshot } from "@amnis/shared";
import { QUOTA_POLL_MS } from "../config.ts";

export interface QuotaPollerDeps {
  sample(): Promise<QuotaSnapshot>;
  onSample?(snapshot: QuotaSnapshot): void;
  onError?(error: Error): void;
  intervalMs?: number;
}

export interface QuotaPoller {
  stop(): void;
  /** Fuerza una muestra ya, sin esperar al intervalo — botón de recarga
   * manual del panel de cuota. Mismo guard de solapamiento que el propio
   * `tick()`: si ya hay una muestra en vuelo, no hace nada (no apila
   * peticiones contra el endpoint, que es justo lo que el intervalo de
   * 180s existe para evitar). */
  pollNow(): void;
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

  return { stop: () => clearInterval(timer), pollNow: tick };
}
