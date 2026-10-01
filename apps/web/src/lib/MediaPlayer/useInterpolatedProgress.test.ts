import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ProgressAnchor,
  progressAt,
  useInterpolatedProgress,
} from "./useInterpolatedProgress.ts";

const T0 = Date.parse("2026-01-01T00:00:00Z");

const anchor = (over: Partial<ProgressAnchor> = {}): ProgressAnchor => ({
  isPlaying: true,
  progressMs: 10_000,
  measuredAtMs: T0,
  durationMs: 200_000,
  ...over,
});

describe("progressAt", () => {
  it("sonando, avanza con el reloj desde measuredAt", () => {
    expect(progressAt(anchor(), T0)).toBe(10_000);
    expect(progressAt(anchor(), T0 + 2_500)).toBe(12_500);
  });

  it("en pausa se congela, pase el tiempo que pase", () => {
    const paused = anchor({ isPlaying: false });
    expect(progressAt(paused, T0)).toBe(10_000);
    expect(progressAt(paused, T0 + 60_000)).toBe(10_000);
  });

  it("no supera la duración", () => {
    expect(progressAt(anchor(), T0 + 500_000)).toBe(200_000);
  });

  it("nunca es negativa (reloj del cliente por detrás del daemon)", () => {
    expect(progressAt(anchor(), T0 - 5_000)).toBe(10_000);
    expect(progressAt(anchor({ progressMs: -1 }), T0)).toBe(0);
  });
});

describe("useInterpolatedProgress", () => {
  let now = T0;
  const clock = () => now;

  beforeEach(() => {
    vi.useFakeTimers();
    now = T0;
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  async function advance(ms: number) {
    now += ms;
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  }

  it("avanza de forma continua entre snapshots", async () => {
    const { result } = renderHook(() =>
      useInterpolatedProgress(anchor(), { now: clock }),
    );
    expect(result.current).toBe(10_000);
    await advance(1_000);
    expect(result.current).toBe(11_000);
    await advance(1_500);
    expect(result.current).toBe(12_500);
  });

  it("se congela al pausar y no se mueve más", async () => {
    const { result, rerender } = renderHook(
      ({ a }) => useInterpolatedProgress(a, { now: clock }),
      { initialProps: { a: anchor() } },
    );
    await advance(2_000);
    // Llega el snapshot de pausa, medido a los 12 s.
    rerender({
      a: anchor({ isPlaying: false, progressMs: 12_000, measuredAtMs: now }),
    });
    await advance(30_000);
    expect(result.current).toBe(12_000);
  });

  it("se queda en la duración al acabar la canción", async () => {
    const { result } = renderHook(() =>
      useInterpolatedProgress(anchor({ progressMs: 199_000 }), {
        now: clock,
      }),
    );
    await advance(10_000);
    expect(result.current).toBe(200_000);
  });

  it("un snapshot nuevo resincroniza la posición", async () => {
    const { result, rerender } = renderHook(
      ({ a }) => useInterpolatedProgress(a, { now: clock }),
      { initialProps: { a: anchor() } },
    );
    await advance(3_000);
    rerender({ a: anchor({ progressMs: 90_000, measuredAtMs: now }) });
    expect(result.current).toBe(90_000);
  });

  it("con reduced-motion avanza a saltos de 1 s", async () => {
    const { result } = renderHook(() =>
      useInterpolatedProgress(anchor(), { now: clock, reducedMotion: true }),
    );
    await advance(1_000);
    expect(result.current).toBe(11_000);
    // A medio segundo no cambia nada visible.
    now += 500;
    expect(result.current).toBe(11_000);
  });
});
