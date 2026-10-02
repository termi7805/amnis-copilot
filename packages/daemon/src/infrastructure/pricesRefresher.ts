import { PRICES_REFRESH_MS } from "../config.ts";

export interface PricesRefresherDeps {
  refresh(): Promise<{ error: string | null }>;
  onError?(message: string): void;
  intervalMs?: number;
}

/**
 * Descarga al arrancar y luego cada 24 h: los precios cambian con cada
 * lanzamiento de modelo, no cada minuto. Mismo guard de solapamiento que
 * `poller.ts`.
 */
export function startPricesRefresher(deps: PricesRefresherDeps): {
  stop(): void;
} {
  let inFlight = false;

  const tick = () => {
    if (inFlight) return;
    inFlight = true;
    deps
      .refresh()
      .then(({ error }) => {
        if (error) deps.onError?.(error);
      })
      .catch((err) => deps.onError?.((err as Error).message))
      .finally(() => {
        inFlight = false;
      });
  };

  tick();
  const timer = setInterval(tick, deps.intervalMs ?? PRICES_REFRESH_MS);
  timer.unref();

  return { stop: () => clearInterval(timer) };
}
