import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COVER_PHASE_MS,
  SCREEN_EXIT_MS,
  type ScreenMode,
  useNowPlaying,
} from "./useNowPlaying.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type Props = {
  trackId: string | null;
  allowed?: boolean;
  mode?: ScreenMode;
  seconds?: number;
};

function setup(initial: Props) {
  return renderHook(
    (p: Props) =>
      useNowPlaying({
        trackId: p.trackId,
        allowed: p.allowed ?? true,
        mode: p.mode ?? "two-phase",
        seconds: p.seconds ?? 4,
      }),
    { initialProps: initial },
  );
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("useNowPlaying", () => {
  it("el primer render con una pista no la enseña", () => {
    const { result } = setup({ trackId: "a" });
    expect(result.current.active).toBe(false);
  });

  it("al cambiar track.id la enseña", () => {
    const { result, rerender } = setup({ trackId: "a" });
    rerender({ trackId: "b" });
    expect(result.current.active).toBe(true);
    expect(result.current.phase).toBe("cover");
  });

  it("reconectar con la misma pista no la enseña", () => {
    const { result, rerender } = setup({ trackId: "a" });
    rerender({ trackId: "a" });
    expect(result.current.active).toBe(false);
  });

  it("la misma canción reanudada tras una pausa larga no cuenta; una nueva sí", () => {
    const { result, rerender } = setup({ trackId: "a" });
    rerender({ trackId: null });
    rerender({ trackId: "a" });
    expect(result.current.active).toBe(false);
    rerender({ trackId: null });
    rerender({ trackId: "b" });
    expect(result.current.active).toBe(true);
  });

  it("la primera canción tras arrancar sin música sí se enseña", () => {
    const { result, rerender } = setup({ trackId: null });
    rerender({ trackId: "a" });
    expect(result.current.active).toBe(true);
  });

  it("dos fases: portada y a los 1,2 s el texto; dura lo configurado y se apaga", () => {
    const { result, rerender } = setup({ trackId: "a" });
    rerender({ trackId: "b" });
    expect(result.current.phase).toBe("cover");
    advance(COVER_PHASE_MS);
    expect(result.current.phase).toBe("text");
    advance(4_000 - COVER_PHASE_MS);
    expect(result.current.closing).toBe(true);
    expect(result.current.active).toBe(true);
    advance(SCREEN_EXIT_MS);
    expect(result.current.active).toBe(false);
  });

  it("los modos de una sola fase no cambian de fase", () => {
    const { result, rerender } = setup({ trackId: "a", mode: "cover-title" });
    rerender({ trackId: "b", mode: "cover-title" });
    expect(result.current.phase).toBe("cover-title");
    advance(2_000);
    expect(result.current.phase).toBe("cover-title");
  });

  it("el modo none no enseña nada", () => {
    const { result, rerender } = setup({ trackId: "a", mode: "none" });
    rerender({ trackId: "b", mode: "none" });
    expect(result.current.active).toBe(false);
  });

  it("si deja de estar permitido, se corta al instante y no reaparece al volver", () => {
    const { result, rerender } = setup({ trackId: "a" });
    rerender({ trackId: "b" });
    expect(result.current.active).toBe(true);
    rerender({ trackId: "b", allowed: false });
    expect(result.current.active).toBe(false);
    rerender({ trackId: "b", allowed: true });
    advance(500);
    expect(result.current.active).toBe(false);
  });

  it("un cambio de pista mientras no está permitido se da por visto", () => {
    const { result, rerender } = setup({ trackId: "a", allowed: false });
    rerender({ trackId: "b", allowed: false });
    rerender({ trackId: "b", allowed: true });
    expect(result.current.active).toBe(false);
  });

  it("una pista nueva a mitad reinicia la pantalla", () => {
    const { result, rerender } = setup({ trackId: "a" });
    rerender({ trackId: "b" });
    advance(2_000);
    rerender({ trackId: "c" });
    expect(result.current.phase).toBe("cover");
    advance(COVER_PHASE_MS);
    expect(result.current.phase).toBe("text");
  });
});
