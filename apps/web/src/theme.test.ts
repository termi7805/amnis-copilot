import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { THEMES } from "@amnis/shared";
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
const root = top.find((b) => b.selector === ":root") as Block;
const themeBlocks = top.filter((b) =>
  b.selector.startsWith(":root[data-theme="),
);
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
});
