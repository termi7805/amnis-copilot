#!/usr/bin/env node
// Lo que `amnis skin check` no mira: el contenido de los SVG. Amnis pinta cada
// capa como <image>, así que un SVG con scripts o recursos externos no
// funcionaría, y uno con filtros caros se animaría a 150×110 todo el día.
//
// Uso: node lint-svg.mjs <carpeta-de-la-skin>
// Sale con código 1 si hay errores; los avisos no lo cambian.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { SCENE } from "./lib.mjs";

const target = process.argv[2];
if (!target) {
  console.error("Uso: lint-svg.mjs <carpeta-de-la-skin>");
  process.exit(1);
}
const root = resolve(target);

function svgFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? svgFiles(join(dir, e.name))
      : e.name.toLowerCase().endsWith(".svg")
        ? [join(dir, e.name)]
        : [],
  );
}

const ERRORS = [
  [/<script\b/i, "lleva <script>: una imagen no los ejecuta"],
  [/<foreignObject\b/i, "lleva <foreignObject>: no se pinta como imagen"],
  [/\son[a-z]+\s*=/i, "lleva un manejador de evento (onclick…)"],
  [/@import\b/i, "importa una hoja de estilos externa"],
  [
    /(?:xlink:)?href\s*=\s*["'](?!data:|#)[^"']*["']/i,
    "referencia un fichero o URL externo: una imagen no los carga (usa data: o inline)",
  ],
  [/url\(\s*["']?(?!#|data:)/i, "url() a un recurso externo"],
];
const WARNINGS = [
  [
    /<filter\b|feGaussianBlur|feDropShadow/i,
    "usa filtros (blur, sombras): caros de animar todo el día a 150×110",
  ],
  [
    /<text\b|font-family/i,
    "lleva texto con fuente: no se sabe qué fuente habrá; pásalo a trazos o usa una capa `text` del manifest para los datos de Amnis",
  ],
];

let failed = false;
let count = 0;
for (const file of svgFiles(root)) {
  count++;
  const rel = file.slice(root.length + 1).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8");
  const report = (mark, why) => console.log(`${mark} ${rel}: ${why}`);

  for (const [re, why] of ERRORS) {
    if (re.test(text)) {
      report("✗", why);
      failed = true;
    }
  }
  for (const [re, why] of WARNINGS) {
    if (re.test(text)) report("⚠", why);
  }
  const size = statSync(file).size;
  if (size > 500_000) {
    report(
      "⚠",
      `pesa ${Math.round(size / 1024)} KB: se vuelve a decodificar en cada cambio de estado`,
    );
  }

  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? "";
  const vb =
    /viewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(
      tag,
    );
  if (!vb) {
    report(
      "⚠",
      'sin viewBox: el lienzo debe ser 150×110 (viewBox="0 0 150 110")',
    );
  } else {
    const [w, h] = [Number(vb[1]), Number(vb[2])];
    // Una capa mide 1 lienzo de ancho; una tira de frames, N lienzos.
    const lienzos = (w * SCENE.height) / (h * SCENE.width);
    if (!(lienzos >= 1) || Math.abs(lienzos - Math.round(lienzos)) > 1e-3) {
      report(
        "⚠",
        `viewBox ${w}×${h}: una capa se estira al lienzo 150×110 (proporción 15:11); una tira de frames mide N·150 × 110`,
      );
    }
  }
}

if (count === 0) console.log("(sin SVG que revisar)");
else if (!failed)
  console.log(`✓ ${count} SVG sin scripts ni recursos externos`);
process.exitCode = failed ? 1 : 0;
