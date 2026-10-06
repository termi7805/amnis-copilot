import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SKIN_STATES } from "@amnis/shared";
import { checkSkin } from "../src/application/skins.ts";
import { skinFolder } from "../src/infrastructure/skinFiles.ts";

/**
 * La skill `amnis-skin` (#160) trae scripts que escriben skins: estos tests
 * los ejecutan y pasan el resultado por el validador real, para que un cambio
 * del formato rompa aquí y no en manos de quien crea una skin.
 */
const SKILL = fileURLToPath(
  new URL("../../../.claude/skills/amnis-skin/", import.meta.url),
);
const run = (name: string, ...args: string[]) =>
  execFileSync(process.execPath, [join(SKILL, "scripts", name), ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const temp = () => mkdtempSync(join(tmpdir(), "amnis-skinskill-"));

test("placeholders.mjs genera una skin que el validador acepta, con los 12 estados animados", () => {
  const root = temp();
  try {
    const dir = join(root, "marcadores");
    run("placeholders.mjs", dir, "--name", "Marcadores");

    const { manifest, errors, warnings } = checkSkin(skinFolder(dir));
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
    assert.equal(manifest?.name, "Marcadores");
    assert.deepEqual(
      Object.keys(manifest?.states ?? {}).sort(),
      [...SKIN_STATES].sort(),
    );
    for (const [state, def] of Object.entries(manifest?.states ?? {})) {
      assert.ok(
        def.layers.some((l) => l.anim !== undefined || "frames" in l),
        `${state} no tiene ninguna capa animada`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("placeholders.mjs no pisa una skin existente sin --force", () => {
  const root = temp();
  try {
    const dir = join(root, "x");
    run("placeholders.mjs", dir);
    writeFileSync(join(dir, "skin.json"), '{"mio":true}');
    assert.throws(() => run("placeholders.mjs", dir));
    assert.equal(readFileSync(join(dir, "skin.json"), "utf8"), '{"mio":true}');
    run("placeholders.mjs", dir, "--force");
    assert.notEqual(
      readFileSync(join(dir, "skin.json"), "utf8"),
      '{"mio":true}',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("placeholders.mjs coloca la música según lo elegido (#167): reproductor en el objeto o en ninguna parte, sin cascos", () => {
  const root = temp();
  const silent = new Set(["waiting", "limited"]);
  try {
    const objeto = join(root, "objeto");
    run("placeholders.mjs", objeto, "--player", "object", "--no-headphones");
    const a = checkSkin(skinFolder(objeto));
    assert.deepEqual(a.errors, []);
    assert.deepEqual(a.warnings, []);
    for (const [state, def] of Object.entries(a.manifest?.states ?? {})) {
      const players = def.layers.filter(
        (l) => "role" in l && l.role === "player",
      );
      assert.equal(players.length, silent.has(state) ? 0 : 1, state);
      const head = def.layers.find((l) => "role" in l && l.role === "head");
      assert.equal(head && "headphones" in head && head.headphones, false);
      // El reproductor va el último: nada del objeto lo tapa.
      if (players[0]) assert.equal(def.layers.at(-1), players[0], state);
    }

    const nada = join(root, "nada");
    run("placeholders.mjs", nada, "--player", "none");
    const b = checkSkin(skinFolder(nada));
    assert.deepEqual(b.errors, []);
    assert.deepEqual(b.warnings, []);
    for (const def of Object.values(b.manifest?.states ?? {})) {
      const head = def.layers.find((l) => "role" in l && l.role === "head");
      assert.ok(head && "player" in head && head.player === false);
      assert.ok(head && !("headphones" in head));
    }

    assert.throws(() =>
      run("placeholders.mjs", join(root, "mal"), "--player", "cara"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("place.mjs coloca un PNG en el lienzo 150×110 deduciendo la proporción", () => {
  const root = temp();
  try {
    // PNG 1×1: la cabecera IHDR es lo único que lee el script.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
      "base64",
    );
    const piece = join(root, "pieza.png");
    writeFileSync(piece, png);
    const out = join(root, "capa.svg");
    run("place.mjs", piece, out, "--at", "10,20", "--width", "30");
    const svg = readFileSync(out, "utf8");
    assert.match(svg, /viewBox="0 0 150 110"/);
    assert.match(svg, /x="10" y="20" width="30" height="30"/);
    assert.match(svg, /href="data:image\/png;base64,/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("strip.mjs une fotogramas en una tira de N lienzos de ancho", () => {
  const root = temp();
  try {
    const dir = join(root, "s");
    run("placeholders.mjs", dir);
    const out = join(dir, "tira.svg");
    run(
      "strip.mjs",
      out,
      join(dir, "head.svg"),
      join(dir, "body.svg"),
      join(dir, "arm.svg"),
    );
    const svg = readFileSync(out, "utf8");
    assert.match(svg, /viewBox="0 0 450 110"/);
    assert.match(svg, /<svg x="300" y="0" width="150" height="110"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lint-svg.mjs rechaza scripts y recursos externos, y avisa de filtros", () => {
  const root = temp();
  try {
    const dir = join(root, "l");
    mkdirSync(dir);
    const wrap = (body: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 110">${body}</svg>`;
    writeFileSync(join(dir, "ok.svg"), wrap('<rect width="5" height="5"/>'));
    assert.match(run("lint-svg.mjs", dir), /✓ 1 SVG/);

    writeFileSync(join(dir, "mal.svg"), wrap("<script>alert(1)</script>"));
    writeFileSync(
      join(dir, "ext.svg"),
      wrap('<image href="https://x.test/a.png"/>'),
    );
    writeFileSync(
      join(dir, "blur.svg"),
      wrap("<filter><feGaussianBlur/></filter>"),
    );
    let out = "";
    assert.throws(
      () => run("lint-svg.mjs", dir),
      (err: { stdout?: string; status?: number }) => {
        out = String(err.stdout);
        return err.status === 1;
      },
    );
    assert.match(out, /✗ mal\.svg: lleva <script>/);
    assert.match(out, /✗ ext\.svg: referencia un fichero o URL externo/);
    assert.match(out, /⚠ blur\.svg: usa filtros/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("una skin de marcadores rota a propósito (pivote y animación): el validador lo detecta", () => {
  const root = temp();
  try {
    const dir = join(root, "rota");
    run("placeholders.mjs", dir);
    const manifest = JSON.parse(readFileSync(join(dir, "skin.json"), "utf8"));
    manifest.states.coding.layers[1].pivot = [900, 10];
    manifest.states.coding.layers[2].anim = "no-existe";
    writeFileSync(join(dir, "skin.json"), JSON.stringify(manifest));

    const { errors } = checkSkin(skinFolder(dir));
    assert.ok(errors.some((e) => e.includes("states.coding.layers[1].pivot")));
    assert.ok(errors.some((e) => e.includes("states.coding.layers[2].anim")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
