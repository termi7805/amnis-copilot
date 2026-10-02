export interface PaceSample {
  at: Date;
  /** `%` autoritativo de la ventana de 5 h en ese instante. */
  utilization: number;
}

/** Por debajo de esto la pendiente es ruido, no ritmo. */
export const MIN_PACE_SAMPLES = 3;
export const MIN_PACE_SPAN_MS = 10 * 60_000;
/** La pendiente se mide sobre la última hora, no sobre toda la ventana. */
export const PACE_LOOKBACK_MS = 60 * 60_000;

/**
 * A qué porcentaje llegará la ventana de 5 h en su reset si el ritmo de la
 * última hora se mantiene. La ventana es fija, no rodante (DESIGN.md §2): solo
 * cuentan las muestras de `[windowStart, resetsAt]`, y la proyección se para
 * en `resetsAt`.
 *
 * `null` cuando no hay ritmo que medir: menos de `MIN_PACE_SAMPLES` muestras,
 * menos de `MIN_PACE_SPAN_MS` entre la primera y la última, o la última ya en
 * el reset. Misma regla que el `~` de lo estimado: mejor ningún número que uno
 * inventado.
 *
 * Mínimos cuadrados sobre la última hora. Una pendiente negativa (el uso no
 * baja dentro de una ventana) es ruido y se toma como 0. No se recorta a 100:
 * pasar de 100 es una señal real (como `estimate()` en `localQuota.ts`).
 */
export function projectAtReset(
  samples: readonly PaceSample[],
  windowStart: Date,
  resetsAt: Date,
): number | null {
  const inWindow = samples
    .filter((s) => s.at >= windowStart && s.at <= resetsAt)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const last = inWindow.at(-1);
  if (!last || last.at >= resetsAt) return null;

  const recent = inWindow.filter(
    (s) => last.at.getTime() - s.at.getTime() <= PACE_LOOKBACK_MS,
  );
  const first = recent[0];
  if (
    !first ||
    recent.length < MIN_PACE_SAMPLES ||
    last.at.getTime() - first.at.getTime() < MIN_PACE_SPAN_MS
  ) {
    return null;
  }

  // x en ms relativos a la primera muestra, para no perder precisión.
  const xs = recent.map((s) => s.at.getTime() - first.at.getTime());
  const ys = recent.map((s) => s.utilization);
  const n = recent.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - meanX;
    num += dx * ((ys[i] ?? 0) - meanY);
    den += dx * dx;
  }
  const slope = den === 0 ? 0 : Math.max(0, num / den);

  return last.utilization + slope * (resetsAt.getTime() - last.at.getTime());
}
