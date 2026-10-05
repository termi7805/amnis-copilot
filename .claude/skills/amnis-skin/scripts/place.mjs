#!/usr/bin/env node
// Coloca y escala una pieza (png, svg…) dentro de un lienzo 150×110 y escribe
// el SVG de capa listo para skin.json.
//
// Uso: node place.mjs <pieza> <salida.svg> --at x,y --width w
//        [--height h] [--rotate grados] [--about x,y]
//   --at      esquina superior izquierda de la pieza en el lienzo (viewBox 150×110)
//   --height  opcional con png/svg (se deduce la proporción); obligatorio con webp/jpg/gif
//   --rotate  gira la pieza; --about es el centro del giro (por defecto, el de la pieza)
import { readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import {
  flag,
  intrinsicSize,
  pairFlag,
  readSvg,
  SCENE,
  withoutBox,
} from "./lib.mjs";

const args = process.argv.slice(2);
const FLAGS = ["--at", "--width", "--height", "--rotate", "--about"];
const [input, output] = args.filter(
  (a, i) => !a.startsWith("--") && !FLAGS.includes(args[i - 1]),
);
const at = pairFlag(args, "--at");
const width = Number(flag(args, "--width"));
if (!input || !output || !at || !(width > 0)) {
  console.error(
    "Uso: place.mjs <pieza> <salida.svg> --at x,y --width w [--height h] [--rotate g] [--about x,y]",
  );
  process.exit(1);
}

const ext = extname(input).toLowerCase();
const natural = intrinsicSize(input);
let height =
  flag(args, "--height") === undefined
    ? undefined
    : Number(flag(args, "--height"));
if (height === undefined && natural) height = (width * natural[1]) / natural[0];
if (!(height > 0)) {
  console.error(
    `✗ no sé la proporción de ${input}: pasa --height (los ${ext} no se miden aquí).`,
  );
  process.exit(1);
}

const [x, y] = at;
const shown = +height.toFixed(1);
if (x < 0 || y < 0 || x + width > SCENE.width || y + height > SCENE.height) {
  console.error(
    `⚠ la pieza (${x},${y} ${width}×${shown}) se sale del lienzo ${SCENE.width}×${SCENE.height}; lo que sobre no se verá.`,
  );
}

const rotate = Number(flag(args, "--rotate") ?? 0);
const [cx, cy] = pairFlag(args, "--about") ?? [x + width / 2, y + height / 2];
const transform = rotate ? ` transform="rotate(${rotate} ${cx} ${cy})"` : "";

let piece;
if (ext === ".svg") {
  const { text, tag } = readSvg(input);
  const clean = withoutBox(tag);
  const viewBox =
    /viewBox\s*=/i.test(clean) || !natural
      ? ""
      : ` viewBox="0 0 ${natural[0]} ${natural[1]}"`;
  const xmlns = /xmlns\s*=/i.test(clean)
    ? ""
    : ' xmlns="http://www.w3.org/2000/svg"';
  const open = clean.replace(
    /<svg\b/i,
    `<svg x="${x}" y="${y}" width="${width}" height="${height}"${viewBox}${xmlns}`,
  );
  piece = `<g${transform}>\n${text.replace(tag, open)}\n</g>`;
} else {
  const mime = {
    ".png": "image/png",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
  }[ext];
  if (!mime) {
    console.error(`✗ formato ${ext} no admitido (png, webp, jpg, gif, svg).`);
    process.exit(1);
  }
  const data = readFileSync(input).toString("base64");
  piece = `<image href="data:${mime};base64,${data}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="none"${transform}/>`;
}

writeFileSync(
  output,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SCENE.width} ${SCENE.height}" width="${SCENE.width}" height="${SCENE.height}">\n${piece}\n</svg>\n`,
);
console.log(
  `✓ ${output}: ${input} en (${x}, ${y}) a ${width}×${shown}${rotate ? `, girada ${rotate}°` : ""}`,
);
