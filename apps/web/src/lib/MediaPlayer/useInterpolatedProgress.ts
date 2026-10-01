import { useEffect, useState } from "react";

export interface ProgressAnchor {
  isPlaying: boolean;
  progressMs: number;
  measuredAtMs: number;
  durationMs: number;
}

/** Acotada a `[0, durationMs]`: al acabar la canción la barra no se sale. */
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
  now?: () => number;
  reducedMotion?: boolean;
}

const REDUCED_STEP_MS = 1_000;

/** Pausada o ya en `durationMs` no hay ticks: se congela. */
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
