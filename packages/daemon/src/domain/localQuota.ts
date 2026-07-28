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
 * Sin `lastReset` → `now` (cero información, la ventana "empieza ahora").
 * Con `lastReset` → avanza en saltos de FIVE_HOUR_MS hasta que la ventana
 * contenga `now`. Con el endpoint, el llamador pasa `resetsAt - 5h` como
 * `lastReset` y el bucle termina en la primera vuelta: mismo código para
 * el caso autoritativo y el inferido de un reset antiguo.
 */
export function windowStart(now: Date, lastReset?: Date): Date {
  if (!lastReset) return now;

  let start = lastReset.getTime();
  const nowMs = now.getTime();
  while (start + FIVE_HOUR_MS <= nowMs) start += FIVE_HOUR_MS;
  return new Date(start);
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
