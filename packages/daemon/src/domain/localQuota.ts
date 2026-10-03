/**
 * Duplica config.ts WINDOW_MS a propósito: domain/ no importa nada del
 * proyecto. Es un hecho fijo de Anthropic (la ventana de rate limit es de
 * 5 horas), no debería divergir nunca — si cambia aquí, cambia también
 * en config.ts.
 */
export const FIVE_HOUR_MS = 5 * 60 * 60_000;

/**
 * La ventana es fija, no rodante: arranca con el primer mensaje y se
 * cierra 5h después de golpe, no se desliza.
 *
 * `lastReset` es el **final** de una ventana (un `resets_at`), no un inicio:
 * - Futuro → la ventana que lo produjo sigue abierta: empezó en `reset − 5h`.
 * - Pasado → la ventana siguiente arranca en el primer evento `≥ reset`; si
 *   ya se cerró (`inicio + 5h ≤ now`), la siguiente arranca en el primer
 *   evento `≥` ese cierre, y así hasta una que contenga `now`.
 * - Pasado y sin evento posterior → `null`: no hay ventana activa, y no se
 *   inventa una (el llamador estima 0 tokens).
 *
 * `firstUsageAtOrAfter` consulta el índice por `ts`: no se recorren los
 * eventos desde un reset de hace días en cada muestra.
 */
export function windowStart(
  now: Date,
  lastReset: Date,
  firstUsageAtOrAfter: (t: Date) => Date | null,
): Date | null {
  const nowMs = now.getTime();
  if (lastReset.getTime() > nowMs) {
    return new Date(lastReset.getTime() - FIVE_HOUR_MS);
  }

  let start = firstUsageAtOrAfter(lastReset);
  while (start && start.getTime() + FIVE_HOUR_MS <= nowMs) {
    start = firstUsageAtOrAfter(new Date(start.getTime() + FIVE_HOUR_MS));
  }
  return start;
}

/** `%` de la ventana. Sin clamping: por encima de 100 es señal real. */
export function estimate(tokens: number, ceilingTokens: number): number {
  return (tokens / ceilingTokens) * 100;
}

/**
 * techo ≈ tokens / (utilization/100). `null` si `utilization` < 10: por
 * debajo de eso el cociente es ruido y envenenaría el techo calibrado.
 * `null` también con 0 tokens locales: no hay nada que calibrar (la
 * ingesta va por detrás del endpoint, o justo tras un reset de ventana),
 * y el resultado sería un techo de 0 en vez de uno bajo.
 */
export function calibrate(tokens: number, utilization: number): number | null {
  if (utilization < 10) return null;
  if (tokens <= 0) return null;
  return tokens / (utilization / 100);
}

/**
 * Fallback de "sin endpoint y sin historial de resets": el primer evento
 * tras un hueco > `windowMs` desde el anterior marca el inicio de la
 * ventana actual. Sin huecos, la ventana empezó en el primer evento.
 * `null` si no hay eventos.
 */
export function findGapStart(
  timestampsAscending: Date[],
  windowMs: number,
): Date | null {
  const [first, ...rest] = timestampsAscending;
  if (!first) return null;

  let previous = first;
  for (const current of rest) {
    if (current.getTime() - previous.getTime() > windowMs) return current;
    previous = current;
  }
  return first;
}
