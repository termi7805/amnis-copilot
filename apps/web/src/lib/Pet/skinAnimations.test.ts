import type { SkinAnimation } from "@amnis/shared";
import { validateSkinAnimation } from "@amnis/shared";
import { describe, expect, it } from "vitest";
import {
  animationCss,
  catalogCss,
  pivotStyle,
  SERIES_ANIMATIONS,
} from "./skinAnimations.ts";

const handmade: SkinAnimation = {
  beats: 2,
  keyframes: [
    { at: 0, rotate: 0 },
    { at: 50, rotate: 30, x: 4 },
    { at: 100, rotate: 0 },
  ],
};

describe("catálogo de serie", () => {
  it("cada animación valida con el mismo validador que una skin", () => {
    for (const [name, anim] of Object.entries(SERIES_ANIMATIONS)) {
      expect(validateSkinAnimation(anim), name).toHaveProperty("animation");
    }
  });

  it("genera CSS para todo el catálogo", () => {
    const css = catalogCss();
    for (const name of Object.keys(SERIES_ANIMATIONS)) {
      expect(css).toContain(`@keyframes amnis-anim-${name}{`);
    }
  });
});

describe("animationCss", () => {
  it("la duración va en beats de --t, con prefijo propio", () => {
    const css = animationCss("giro", handmade);
    expect(css).toContain("@keyframes amnis-anim-giro{");
    expect(css).toContain(
      ".amnis-anim-giro{animation:amnis-anim-giro calc(var(--t)*2) ease-in-out infinite}",
    );
    expect(css).toContain("translate(4px,0px) rotate(30deg) scale(1,1)");
  });

  it("se apaga con movimiento reducido", () => {
    expect(animationCss("giro", handmade)).toContain(
      "@media (prefers-reduced-motion:reduce){.amnis-anim-giro{animation:none}}",
    );
  });

  it("steps y delay salen en el shorthand", () => {
    const css = animationCss("a", {
      beats: 1,
      steps: 4,
      delay: 0.25,
      keyframes: [
        { at: 0, y: 0 },
        { at: 100, y: -24 },
      ],
    });
    expect(css).toContain("steps(4,end) calc(var(--t)*0.25) infinite");
  });

  it("opacity sin transformación no emite transform", () => {
    const css = animationCss("o", {
      beats: 1,
      keyframes: [
        { at: 0, opacity: 0 },
        { at: 100, opacity: 1 },
      ],
    });
    expect(css).not.toContain("transform");
    expect(css).toContain("opacity:1");
  });
});

describe("entrada no fiable", () => {
  const inyecciones: [string, unknown][] = [
    [
      "rotate con texto",
      { beats: 1, keyframes: [{ at: 0, rotate: "1deg}body{color:red" }] },
    ],
    ["x NaN", { beats: 1, keyframes: [{ at: 0, x: Number.NaN }] }],
    [
      "y Infinity",
      { beats: 1, keyframes: [{ at: 0, y: Number.POSITIVE_INFINITY }] },
    ],
    ["opacity con texto", { beats: 1, keyframes: [{ at: 0, opacity: "0;}" }] }],
    ["scale con texto", { beats: 1, keyframes: [{ at: 0, scale: ["1", 1] }] }],
    ["beats con texto", { beats: "1)}", keyframes: [{ at: 0, x: 1 }] }],
    [
      "easing libre",
      {
        beats: 1,
        easing: "cubic-bezier(0,0,0,0)}",
        keyframes: [{ at: 0, x: 1 }],
      },
    ],
    [
      "campo desconocido",
      { beats: 1, color: "red", keyframes: [{ at: 0, x: 1 }] },
    ],
    [
      "campo desconocido en fotograma",
      { beats: 1, keyframes: [{ at: 0, filter: "x" }] },
    ],
  ];

  it.each(inyecciones)("%s se rechaza y no llega al CSS", (_, raw) => {
    const result = validateSkinAnimation(raw);
    expect(result).toHaveProperty("errors");
    expect(() => animationCss("x", raw as SkinAnimation)).toThrow();
  });

  it("un nombre con CSS dentro se rechaza", () => {
    for (const name of ["x{}", "A", "1a", "a b", ""]) {
      expect(() => animationCss(name, handmade)).toThrow();
    }
  });

  it("los errores nombran el campo", () => {
    const result = validateSkinAnimation({
      beats: 1,
      keyframes: [{ at: 0 }, { at: 10, rotate: 9999 }],
    });
    expect(result).toEqual({
      errors: [expect.stringContaining("keyframes[1].rotate")],
    });
  });
});

describe("rangos", () => {
  const kf = [
    { at: 0, x: 1 },
    { at: 100, x: 2 },
  ];
  const errorsOf = (raw: unknown) =>
    "errors" in validateSkinAnimation(raw)
      ? (validateSkinAnimation(raw) as { errors: string[] }).errors.join("|")
      : "";

  it("at debe crecer", () => {
    expect(
      errorsOf({ beats: 1, keyframes: [{ at: 50 }, { at: 50 }] }),
    ).toContain("keyframes[1].at");
  });
  it("delay < beats", () => {
    expect(errorsOf({ beats: 1, delay: 1, keyframes: kf })).toContain("delay");
  });
  it("steps no se combina con easing", () => {
    expect(
      errorsOf({ beats: 1, steps: 2, easing: "linear", keyframes: kf }),
    ).toContain("steps");
  });
  it("steps entero", () => {
    expect(errorsOf({ beats: 1, steps: 2.5, keyframes: kf })).toContain(
      "entero",
    );
  });
  it("beats > 0", () => {
    expect(errorsOf({ beats: 0, keyframes: kf })).toContain("beats");
  });
});

describe("pivotStyle", () => {
  it("da el origen en px del viewBox", () => {
    expect(pivotStyle([12, 34.5])).toEqual({
      transformOrigin: "12px 34.5px",
      transformBox: "view-box",
    });
  });
  it("rechaza no finitos", () => {
    expect(() => pivotStyle([Number.NaN, 0])).toThrow();
    expect(() => pivotStyle(["1px" as unknown as number, 0])).toThrow();
  });
});
