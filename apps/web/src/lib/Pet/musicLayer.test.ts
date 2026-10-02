import { describe, expect, it } from "vitest";
import {
  amplitude,
  beatSeconds,
  DEFAULT_MUSIC_PREFS,
  layerColor,
  VIBE_COLOR,
} from "./musicLayer.ts";

describe("beatSeconds", () => {
  it("es 60 / BPM", () => {
    expect(beatSeconds(120)).toBeCloseTo(0.5, 5);
    expect(beatSeconds(75)).toBeCloseTo(0.8, 5);
  });

  it("acota un BPM absurdo en vez de dar una animación imposible", () => {
    expect(beatSeconds(400)).toBeCloseTo(60 / 200, 5);
    expect(beatSeconds(10)).toBeCloseTo(60 / 50, 5);
  });

  it("sin BPM (podcast, sin datos) da un valor finito", () => {
    for (const bpm of [null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(Number.isFinite(beatSeconds(bpm as number | null))).toBe(true);
    }
  });
});

describe("amplitude", () => {
  it("fresca no amortigua; agotada deja el 30 % con el 70 % por defecto", () => {
    expect(amplitude(0, DEFAULT_MUSIC_PREFS.damping)).toBe(1);
    expect(amplitude(1, DEFAULT_MUSIC_PREFS.damping)).toBeCloseTo(0.3, 5);
  });

  it("sin amortiguación la fatiga no cambia nada", () => {
    expect(amplitude(1, 0)).toBe(1);
  });

  it("acota la amortiguación a 0–1", () => {
    expect(amplitude(1, 2)).toBe(0);
    expect(amplitude(1, -1)).toBe(1);
  });
});

describe("layerColor", () => {
  it("por vibe, siempre teal, o la portada (que cae a la vibe por ahora)", () => {
    expect(layerColor("intensa", "vibe")).toBe(VIBE_COLOR.intensa);
    expect(layerColor("intensa", "teal")).toBe("#39E0C8");
    expect(layerColor("chill", "cover")).toBe(VIBE_COLOR.chill);
  });
});
