import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { coverColorFrom, lightColor, useCoverArt } from "./coverArt.ts";

afterEach(() => vi.unstubAllGlobals());

describe("lightColor", () => {
  it("lleva el color medio a un tono claro y saturado, conservando el matiz", () => {
    expect(lightColor(255, 0, 0)).toBe("hsl(0 75% 66%)");
    expect(lightColor(0, 255, 0)).toBe("hsl(120 75% 66%)");
    expect(lightColor(0, 0, 255)).toBe("hsl(240 75% 66%)");
  });

  it("un gris no inventa matiz ni saturación", () => {
    expect(lightColor(120, 120, 120)).toBe("hsl(0 0% 66%)");
  });
});

describe("coverColorFrom", () => {
  it("promedia píxeles RGBA e ignora el alfa", () => {
    // un rojo puro y otro negro → rojo medio
    const px = [255, 0, 0, 255, 0, 0, 0, 255];
    expect(coverColorFrom(px)).toBe(lightColor(127.5, 0, 0));
  });

  it("sin píxeles no revienta", () => {
    expect(coverColorFrom([])).toBe("hsl(0 0% 66%)");
  });
});

describe("useCoverArt", () => {
  it("sin habilitar no toca la imagen", () => {
    const ctor = vi.fn();
    vi.stubGlobal("Image", ctor);
    const { result } = renderHook(() =>
      useCoverArt("https://i.scdn.co/x", false),
    );
    expect(result.current).toEqual({ pixel: null, color: null });
    expect(ctor).not.toHaveBeenCalled();
  });

  it("si la imagen no carga (CORS), devuelve null sin romper", async () => {
    class FailingImage {
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", FailingImage);
    const { result } = renderHook(() =>
      useCoverArt("https://i.scdn.co/x", true),
    );
    await waitFor(() =>
      expect(result.current).toEqual({ pixel: null, color: null }),
    );
  });

  it("si no hay canvas (jsdom) tampoco rompe", async () => {
    class LoadedImage {
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", LoadedImage);
    const { result } = renderHook(() =>
      useCoverArt("https://i.scdn.co/x", true),
    );
    await waitFor(() => expect(result.current.pixel).toBeNull());
    expect(result.current.color).toBeNull();
  });
});
