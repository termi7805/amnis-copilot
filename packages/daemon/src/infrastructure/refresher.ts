export interface RefresherDeps {
  refresh(): Promise<{ error: string | null }>;
  onError?(message: string): void;
  intervalMs: number;
}

/**
 * Descarga al arrancar y luego cada `intervalMs`: precios (24 h) y
 * actualizaciones (6 h). Mismo guard de solapamiento que `poller.ts`.
 */
export function startRefresher(deps: RefresherDeps): {
  runNow(): void;
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
  const timer = setInterval(tick, deps.intervalMs);
  timer.unref();

  return { runNow: tick, stop: () => clearInterval(timer) };
}
