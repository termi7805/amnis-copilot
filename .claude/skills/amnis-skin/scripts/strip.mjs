#!/usr/bin/env node
// Une fotogramas (SVG de lienzo 150×110) en una tira horizontal para `frames`.
// El fotograma i queda desplazado i×150; la tira mide 150·N × 110.
//
// Uso: node strip.mjs <salida.svg> <f1.svg> <f2.svg> [...]
// En skin.json: { "src": "salida.svg", "frames": N, "beats": 2 }
import { writeFileSync } from "node:fs";
import { readSvg, SCENE, withoutBox } from "./lib.mjs";

const [output, ...frames] = process.argv.slice(2);
if (!output || frames.length < 2 || frames.length > 64) {
  console.error(
    "Uso: strip.mjs <salida.svg> <f1.svg> <f2.svg> [...] (de 2 a 64 fotogramas)",
  );
  process.exit(1);
}

const body = frames
  .map((file, i) => {
    const { text, tag } = readSvg(file);
    const open = withoutBox(tag).replace(
      /<svg\b/i,
      `<svg x="${i * SCENE.width}" y="0" width="${SCENE.width}" height="${SCENE.height}"`,
    );
    return text.replace(tag, open);
  })
  .join("\n");

const w = SCENE.width * frames.length;
writeFileSync(
  output,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${SCENE.height}" width="${w}" height="${SCENE.height}">\n${body}\n</svg>\n`,
);
console.log(
  `✓ ${output}: ${frames.length} fotogramas → "frames": ${frames.length}`,
);
