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

interface RecentPace {
  last: PaceSample;
  /** `%` por ms, nunca negativa. */
  slope: number;
}

/**
 * Pendiente de la última hora, compartida por `projectAtReset` y `exhaustsAt`
 * para que la proyección y la hora de agotarse no puedan contradecirse. La
 * ventana es fija, no rodante (DESIGN.md §2): solo cuentan las muestras de
 * `[windowStart, resetsAt]`.
 *
 * `null` cuando no hay ritmo que medir: menos de `MIN_PACE_SAMPLES` muestras,
 * menos de `MIN_PACE_SPAN_MS` entre la primera y la última, o la última ya en
 * el reset. Misma regla que el `~` de lo estimado: mejor ningún número que uno
 * inventado.
 *
 * Mínimos cuadrados. Una pendiente negativa (el uso no baja dentro de una
 * ventana) es ruido y se toma como 0.
 */
function recentPace(
  samples: readonly PaceSample[],
  windowStart: Date,
  resetsAt: Date,
): RecentPace | null {
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
  return { last, slope: den === 0 ? 0 : Math.max(0, num / den) };
}

/**
 * A qué porcentaje llegará la ventana de 5 h en su reset si el ritmo de la
 * última hora se mantiene (`recentPace`). La proyección se para en
 * `resetsAt`.
 *
 * No se recorta a 100: pasar de 100 es una señal real (como `estimate()` en
 * `localQuota.ts`).
 */
export function projectAtReset(
  samples: readonly PaceSample[],
  windowStart: Date,
  resetsAt: Date,
): number | null {
  const pace = recentPace(samples, windowStart, resetsAt);
  if (!pace) return null;
  return (
    pace.last.utilization +
    pace.slope * (resetsAt.getTime() - pace.last.at.getTime())
  );
}

/**
 * Instante en que la recta de la última hora llega al 100 %.
 *
 * `null` sin ritmo medible o con pendiente 0: el uso no se mueve y no hay hora
 * que enseñar, no una hora absurda en el futuro. Con la última muestra ya en
 * ≥ 100 devuelve esa muestra.
 *
 * No se recorta al reset: puede caer después de `resetsAt`, y entonces lo que
 * cuenta es que el uso llega hasta el reset. Eso lo decide quien lo enseña.
 * Extrapola desde la última muestra, igual que `projectAtReset`, así que la
 * proyección pasa de 100 si y solo si esta hora cae antes del reset.
 */
export function exhaustsAt(
  samples: readonly PaceSample[],
  windowStart: Date,
  resetsAt: Date,
): Date | null {
  const pace = recentPace(samples, windowStart, resetsAt);
  if (!pace) return null;
  if (pace.last.utilization >= 100) return pace.last.at;
  if (pace.slope === 0) return null;
  return new Date(
    pace.last.at.getTime() + (100 - pace.last.utilization) / pace.slope,
  );
}
