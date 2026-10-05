#!/usr/bin/env node
// Genera una skin de marcadores: los 12 estados, con rectángulos de color por
// capa y sus animaciones y pivotes ya puestos. Se ve moverse desde el primer
// momento; dibujar es sustituir cada .svg por la pieza real, sin tocar skin.json.
//
// Uso: node placeholders.mjs <carpeta> [--name "Mi skin"] [--force]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const args = process.argv.slice(2);
const force = args.includes("--force");
const nameAt = args.indexOf("--name");
const name = nameAt >= 0 ? args[nameAt + 1] : undefined;
const target = args.find(
  (a, i) => !a.startsWith("--") && args[i - 1] !== "--name",
);
if (!target) {
  console.error('Uso: placeholders.mjs <carpeta> [--name "Mi skin"] [--force]');
  process.exit(1);
}
const dir = resolve(target);
if (existsSync(join(dir, "skin.json")) && !force) {
  console.error(
    `✗ ${dir} ya tiene skin.json; con --force se sobrescribe (pierdes lo que hubiera).`,
  );
  process.exit(1);
}

const svg = (body, w = 150) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 110" width="${w}" height="110">\n${body}\n</svg>\n`;
const rect = (x, y, w, h, fill, rx = 4) =>
  `  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;

// Cada pieza es un lienzo 150×110 completo con el rectángulo ya colocado.
const pieces = {
  "body.svg": svg(
    [
      rect(35, 72, 40, 20, "#8A94A6"),
      rect(38, 91, 12, 5, "#5C6577", 2.5),
      rect(60, 91, 12, 5, "#5C6577", 2.5),
    ].join("\n"),
  ),
  "head.svg": svg(rect(24, 22, 62, 48, "#5B8DEF", 7)),
  "arm.svg": svg(rect(72, 74, 24, 7, "#F2A33A", 3.5)),
  "object.svg": svg(rect(92, 62, 44, 34, "#3DD6B5")),
  // Más alto que la ventana: el `clip` enseña solo una parte y `scroll` lo desplaza.
  "screen.svg": svg(
    Array.from({ length: 8 }, (_, i) =>
      rect(97, 66 + i * 6, 34 - (i % 3) * 8, 3, "#1B2A41", 1),
    ).join("\n"),
  ),
  // Tira de 4 fotogramas: cada uno ocupa 150 de ancho (lienzo × N).
  "strip.svg": svg(
    Array.from({ length: 4 }, (_, i) =>
      rect(i * 150 + 100 + i * 4, 40 - i * 7, 12, 8, "#B48CF2", 3),
    ).join("\n"),
    600,
  ),
};

const head = {
  src: "head.svg",
  role: "head",
  anchor: [55, 46],
  pivot: [55, 70],
  anim: "nod",
};
const layer = (src, anim, pivot) => ({
  src,
  ...(anim && { anim }),
  ...(pivot && { pivot }),
});
const body = (anim = "breathe") => layer("body.svg", anim, [55, 92]);
const arm = (anim) => layer("arm.svg", anim, [72, 77]);
const screen = (anim) => ({
  src: "screen.svg",
  clip: [97, 66, 34, 26],
  anim,
});

const states = {
  coding: [
    body("bob"),
    arm("tap"),
    head,
    layer("object.svg"),
    screen("scroll"),
  ],
  testing: [body(), arm("swing"), head, layer("object.svg", "glow")],
  researching: [body(), arm("drift"), head, layer("object.svg", "wander")],
  planning: [body(), arm(), head, layer("object.svg", "drift")],
  waiting: [
    body(),
    arm("knock"),
    head,
    layer("object.svg", "swing", [114, 62]),
  ],
  resting: [body(), arm(), head, layer("object.svg", "sip", [114, 96])],
  sleeping: [
    body("breathe"),
    { ...head, anim: "blink" },
    { src: "strip.svg", frames: 4, beats: 3 },
  ],
  terminal: [body(), arm(), head, layer("object.svg"), screen("cursor")],
  subagents: [body(), arm("tap"), head, layer("object.svg", "hop")],
  committing: [body(), arm(), head, layer("object.svg", "pop")],
  pushing: [
    body(),
    arm(),
    head,
    layer("object.svg", "bob"),
    { text: "commitHash", at: [96, 58], size: 9, color: "#7EE787" },
  ],
  limited: [
    body("shake"),
    { ...head, anim: "shake" },
    layer("object.svg"),
    { text: "resetsCountdown", at: [96, 58], size: 9, color: "#FF6B6B" },
  ],
};

const manifest = {
  name: name ?? basename(dir),
  states: Object.fromEntries(
    Object.entries(states).map(([s, layers]) => [s, { layers }]),
  ),
};

mkdirSync(dir, { recursive: true });
for (const [file, content] of Object.entries(pieces)) {
  writeFileSync(join(dir, file), content);
}
writeFileSync(join(dir, "skin.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `✓ skin de marcadores en ${dir} (${Object.keys(states).length} estados)`,
);
console.log(`
Qué es cada marcador (sustitúyelo por tu pieza, mismo nombre, lienzo 150×110):
  body.svg    gris azulado   el cuerpo
  head.svg    azul           la cabeza (capa "head": cabecea con la música)
  arm.svg     naranja        el brazo, con su pivote en el hombro
  object.svg  verde agua     el objeto del estado (portátil, lupa, taza…)
  screen.svg  azul oscuro    lo que se ve dentro de una pantalla (recortado con clip)
  strip.svg   violeta        tira de 4 fotogramas (frames), p. ej. las "z" de sleeping`);
