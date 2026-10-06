import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { IDENTITY_COLORS, THEMES } from "@amnis/shared";
import { describe, expect, it } from "vitest";

type Block = { selector: string; tokens: Map<string, string>; scheme: string };

const css = readFileSync(
  resolve(import.meta.dirname, "theme.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** Bloques `selector { … }` de nivel superior y los anidados en `@media`. */
function parseBlocks(src: string): { top: Block[]; media: Block[] } {
  const top: Block[] = [];
  const media: Block[] = [];
  let depth = 0;
  let start = 0;
  let inMedia = false;
  let mediaDepth = 0;
  let selStart = 0;
  let selector = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      const head = src.slice(selStart, i).trim().replace(/\s+/g, " ");
      if (head.startsWith("@media")) {
        inMedia = true;
        mediaDepth = depth;
      } else {
        selector = head;
        start = i + 1;
      }
      depth++;
      selStart = i + 1;
    } else if (ch === "}") {
      depth--;
      if (inMedia && depth === mediaDepth) {
        inMedia = false;
      } else {
        const body = src.slice(start, i);
        const tokens = new Map<string, string>();
        for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
          tokens.set(m[1] as string, (m[2] as string).trim());
        }
        const scheme = /color-scheme:\s*(\w+)/.exec(body)?.[1] ?? "";
        (inMedia ? media : top).push({ selector, tokens, scheme });
      }
      selStart = i + 1;
    }
  }
  return { top, media };
}

const { top, media } = parseBlocks(css);
const root = top.find((b) => b.selector.startsWith(":root")) as Block;
const themeBlocks = top.filter((b) => b.selector.startsWith("[data-theme="));
const idOf = (b: Block) => /data-theme="([^"]+)"/.exec(b.selector)?.[1] ?? "";
const systemDark = media.find((b) => b.selector.includes(":not([data-theme])"));

const catalogIds = THEMES.map((t) => t.id).filter((id) => id !== "system");
const toCheck = [
  { name: "light", block: root },
  ...(systemDark ? [{ name: "system (media oscuro)", block: systemDark }] : []),
  ...themeBlocks.map((b) => ({ name: idOf(b), block: b })),
];

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`se esperaba #rrggbb y llegó "${hex}"`);
  const n = Number.parseInt(m[1] as string, 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255)
  );
}

/** OKLab (Ottosson): una distancia euclídea aquí se parece a cuánto se distinguen dos colores. */
function oklab(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function distance(a: string, b: string): number {
  const [p, q] = [oklab(a), oklab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi as number) + 0.05) / ((lo as number) + 0.05);
}

describe("theme.css", () => {
  it("el parser encuentra :root y el bloque de «Sistema»", () => {
    expect(root.tokens.size).toBeGreaterThan(30);
    expect(systemDark).toBeDefined();
    expect(systemDark?.selector).toContain(':root[data-theme="system"]');
  });

  it("cada tema del catálogo tiene bloque y redefine todos los tokens de :root", () => {
    const ids = new Set(themeBlocks.map(idOf));
    for (const id of catalogIds) {
      // «light» es el propio :root, la referencia: no lleva bloque aparte.
      if (id === "light") continue;
      expect(ids.has(id), `falta el bloque de ${id}`).toBe(true);
    }
    for (const { name, block } of toCheck) {
      if (name === "light") continue;
      const missing = [...root.tokens.keys()].filter(
        (t) => !block.tokens.has(t),
      );
      expect(missing, `${name} no redefine ${missing.join(", ")}`).toEqual([]);
    }
  });

  it("ningún bloque de tema va atado a :root, o su muestra en Ajustes no se pinta", () => {
    const atados = top
      .filter((b) => /:root\[data-theme=/.test(b.selector))
      .map((b) => b.selector);
    expect(atados, "usa [data-theme=…] a secas (#125)").toEqual([]);
    expect(root.selector).toContain('[data-theme="light"]');
  });

  it("no hay bloques de tema fuera del catálogo", () => {
    const known = new Set<string>(THEMES.map((t) => t.id));
    const extra = themeBlocks.map(idOf).filter((id) => !known.has(id));
    expect(extra).toEqual([]);
  });

  it("el color-scheme de cada bloque coincide con el del catálogo", () => {
    for (const b of themeBlocks) {
      const entry = THEMES.find((t) => t.id === idOf(b));
      expect(b.scheme, idOf(b)).toBe(entry?.scheme);
    }
  });

  describe("contraste sobre --surface", () => {
    const minimos: [string, number][] = [
      ["--ink", 4.5],
      ["--ink-2", 4.5],
      ["--accent", 4.5],
      ["--crit", 4.5],
      ["--ink-3", 3],
      ["--ok", 3],
      ["--warn", 3],
    ];
    for (const { name, block } of toCheck) {
      for (const [token, min] of minimos) {
        it(`${name}: ${token} ≥ ${min}`, () => {
          const fg = block.tokens.get(token) as string;
          const bg = block.tokens.get("--surface") as string;
          const ratio = contrast(fg, bg);
          expect(
            ratio,
            `${token} ${fg} sobre ${bg} = ${ratio.toFixed(2)}`,
          ).toBeGreaterThanOrEqual(min);
        });
      }
    }
  });

  describe("Alto contraste", () => {
    const block = themeBlocks.find(
      (b) => idOf(b) === "alto-contraste",
    ) as Block;
    // Es el tema de accesibilidad: sus mínimos son AAA, no los del resto.
    for (const token of [
      "--ink",
      "--ink-2",
      "--ink-3",
      "--accent",
      "--crit",
      "--ok",
      "--warn",
    ]) {
      it(`${token} ≥ 7 sobre --surface`, () => {
        const fg = block.tokens.get(token) as string;
        const bg = block.tokens.get("--surface") as string;
        const ratio = contrast(fg, bg);
        expect(
          ratio,
          `${token} ${fg} sobre ${bg} = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(7);
      });
    }
  });

  describe("paleta de identidad", () => {
    // Lo que la escena ya usa para decir algo: la franja no puede parecerse.
    const reservados: [string, string][] = [
      ["rojo de limited", "#ec3013"],
      ["antena fresca", "#39e0c8"],
      ["antena cansada", "#d88f6a"],
      ["antena de waiting", "#ffb020"],
    ];
    const MARCO = "#4a5563";
    const ids = Array.from({ length: IDENTITY_COLORS }, (_, i) => `--id-${i}`);
    for (const { name, block } of toCheck) {
      it(`${name}: ${IDENTITY_COLORS} colores distintos entre sí, de lo reservado y legibles sobre el marco`, () => {
        const colors = ids.map((id) => block.tokens.get(id) as string);
        expect(colors.every(Boolean), "falta algún --id-N").toBe(true);
        expect(block.tokens.has(`--id-${IDENTITY_COLORS}`)).toBe(false);
        for (let i = 0; i < colors.length; i++) {
          const c = colors[i] as string;
          for (let j = i + 1; j < colors.length; j++) {
            const d = distance(c, colors[j] as string);
            expect(
              d,
              `--id-${i} ${c} y --id-${j} ${colors[j]}`,
            ).toBeGreaterThanOrEqual(0.1);
          }
          for (const [what, hex] of [
            ...reservados,
            ["--crit", block.tokens.get("--crit") as string],
          ] as [string, string][]) {
            expect(
              distance(c, hex),
              `--id-${i} ${c} frente a ${what}`,
            ).toBeGreaterThanOrEqual(0.1);
          }
          expect(
            contrast(c, MARCO),
            `--id-${i} ${c} sobre el marco`,
          ).toBeGreaterThanOrEqual(2);
        }
      });
    }
  });
});
