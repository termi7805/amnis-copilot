import { readFileSync } from "node:fs";
import { extname } from "node:path";

export const SCENE = { width: 150, height: 110 };

/** Tamaño intrínseco [ancho, alto] de un PNG o un SVG; `null` si no se sabe. */
export function intrinsicSize(file) {
  const ext = extname(file).toLowerCase();
  const data = readFileSync(file);
  if (ext === ".png") {
    if (data.length < 24 || data.toString("latin1", 1, 4) !== "PNG") {
      return null;
    }
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
  }
  if (ext === ".svg") {
    const tag = /<svg\b[^>]*>/i.exec(data.toString("utf8"))?.[0] ?? "";
    const vb =
      /viewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(
        tag,
      );
    if (vb) return [Number(vb[1]), Number(vb[2])];
    const w = /\swidth\s*=\s*["']([\d.]+)/i.exec(tag);
    const h = /\sheight\s*=\s*["']([\d.]+)/i.exec(tag);
    if (w && h) return [Number(w[1]), Number(h[1])];
  }
  return null;
}

export function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export function pairFlag(args, name) {
  const v = flag(args, name);
  if (v === undefined) return undefined;
  const p = v.split(",").map(Number);
  if (p.length !== 2 || p.some((n) => !Number.isFinite(n))) {
    console.error(
      `✗ ${name} debe ser "x,y" (números), no ${JSON.stringify(v)}`,
    );
    process.exit(1);
  }
  return p;
}

/** Quita la cabecera `<?xml …?>` y devuelve el texto y su etiqueta `<svg …>`. */
export function readSvg(file) {
  const text = readFileSync(file, "utf8").replace(/^<\?xml[^>]*\?>\s*/i, "");
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!tag) throw new Error(`${file} no tiene <svg>`);
  return { text, tag };
}

/** La etiqueta `<svg>` sin su posición ni tamaño, para ponerle los nuevos. */
export function withoutBox(tag) {
  return tag.replace(/\s(?:x|y|width|height)\s*=\s*("[^"]*"|'[^']*')/gi, "");
}
