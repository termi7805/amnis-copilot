import { useEffect, useState } from "react";

/** Lo mínimo de un `MediaSnapshot` que hace falta para interpolar. */
export interface ProgressAnchor {
  isPlaying: boolean;
  /** Posición medida en `measuredAtMs`. */
  progressMs: number;
  measuredAtMs: number;
  durationMs: number;
}

/**
 * Dónde está la canción en `nowMs`. Pausada, la posición medida tal cual;
 * sonando, avanza con el reloj del cliente. Siempre acotada a
 * `[0, durationMs]`: al acabar la canción la barra no se sale mientras llega
 * el siguiente snapshot.
 */
export function progressAt(anchor: ProgressAnchor, nowMs: number): number {
  const elapsed = anchor.isPlaying
    ? Math.max(0, nowMs - anchor.measuredAtMs)
    : 0;
  return Math.min(
    Math.max(0, anchor.progressMs + elapsed),
    Math.max(0, anchor.durationMs),
  );
}

export interface InterpolationOptions {
  /** Reloj inyectable para tests. */
  now?: () => number;
  /** Con reduced-motion la posición se actualiza a saltos de 1 s. */
  reducedMotion?: boolean;
}

const REDUCED_STEP_MS = 1_000;

/**
 * Posición interpolada entre snapshots (el daemon sondea cada ~3 s). Sin
 * ticks ni trabajo cuando está pausada o ya en `durationMs`: se congela. Un
 * snapshot nuevo cambia el ancla y la posición se resincroniza sola.
 */
export function useInterpolatedProgress(
  anchor: ProgressAnchor,
  { now = Date.now, reducedMotion = false }: InterpolationOptions = {},
): number {
  const [, setTick] = useState(0);
  const { isPlaying, progressMs, measuredAtMs, durationMs } = anchor;

  useEffect(() => {
    const current = { isPlaying, progressMs, measuredAtMs, durationMs };
    if (!isPlaying || progressAt(current, now()) >= durationMs) return;

    const bump = () => setTick((t) => t + 1);
    if (reducedMotion) {
      const id = setInterval(bump, REDUCED_STEP_MS);
      return () => clearInterval(id);
    }

    let frame = 0;
    const loop = () => {
      bump();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, progressMs, measuredAtMs, durationMs, reducedMotion, now]);

  const position = progressAt(anchor, now());
  // A saltos de 1 s, ver `REDUCED_STEP_MS`: sin esto el intervalo (que no va
  // alineado con el segundo de la canción) mostraría fracciones.
  return reducedMotion
    ? Math.min(
        durationMs,
        progressMs +
          Math.floor((position - progressMs) / REDUCED_STEP_MS) *
            REDUCED_STEP_MS,
      )
    : position;
}

/** `matchMedia` no existe en jsdom: sin él, movimiento normal. */
export function usePrefersReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === "function" && matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mql = matchMedia(query);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
