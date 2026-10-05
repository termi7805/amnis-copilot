import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSkinManifest } from "@amnis/shared";

const layer = (extra: object = {}) => ({ src: "coding/body.png", ...extra });
const skin = (states: object, rest: object = {}) => ({ states, ...rest });

function errorsOf(raw: unknown): string[] {
  const r = validateSkinManifest(raw);
  assert.ok("errors" in r, "se esperaba un rechazo");
  return r.errors;
}

function mention(errors: string[], ...parts: string[]) {
  assert.ok(
    errors.some((e) => parts.every((p) => e.includes(p))),
    `ningún error contiene ${JSON.stringify(parts)}:\n${errors.join("\n")}`,
  );
}

test("un manifest que solo declara coding se acepta sin avisos", () => {
  const r = validateSkinManifest(skin({ coding: { layers: [layer()] } }));
  assert.ok("manifest" in r);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.manifest.size, [150, 110]);
  assert.deepEqual(Object.keys(r.manifest.states), ["coding"]);
});

test("una anim que no existe nombra estado, capa y animación", () => {
  const e = errorsOf(
    skin({ testing: { layers: [layer(), layer({ anim: "nope" })] } }),
  );
  mention(e, "states.testing.layers[1].anim", "nope");
});

test("una anim del catálogo o propia se acepta", () => {
  const r = validateSkinManifest(
    skin(
      { coding: { layers: [layer({ anim: "bob" }), layer({ anim: "mia" })] } },
      { animations: { mia: { beats: 1, keyframes: [{ at: 0, x: 1 }] } } },
    ),
  );
  assert.ok("manifest" in r);
});

test("una ruta con .., absoluta o URL se rechaza nombrando el campo", () => {
  for (const src of [
    "../secreto.png",
    "a/../../b.png",
    "/etc/x.png",
    "C:/x.png",
    "C:\\x.png",
    "http://x/y.png",
    "a\\b.png",
    "a/b.txt",
    "a//b.png",
  ]) {
    const e = errorsOf(skin({ coding: { layers: [{ src }] } }));
    mention(e, "states.coding.layers[0].src");
  }
  mention(errorsOf(skin({ coding: { layers: [{ src: "../x.png" }] } })), "..");
});

test("dos capas head en el mismo estado se rechazan", () => {
  const e = errorsOf(
    skin({
      music: { layers: [] },
      coding: {
        layers: [layer({ role: "head" }), layer(), layer({ role: "head" })],
      },
    }),
  );
  mention(e, "states.coding", "head");
});

test("head en estados distintos está bien", () => {
  const r = validateSkinManifest(
    skin({
      coding: { layers: [layer({ role: "head" })] },
      testing: { layers: [layer({ role: "head" })] },
    }),
  );
  assert.ok("manifest" in r);
});

test("un color que no es hex se rechaza", () => {
  for (const color of ["red", "#12", "url(x)", "#ggg", "#12345", 5]) {
    const e = errorsOf(
      skin({
        committing: {
          layers: [{ text: "commitHash", at: [10, 10], size: 8, color }],
        },
      }),
    );
    mention(e, "states.committing.layers[0].color", "hex");
  }
});

test("colores hex válidos y texto con datos de Amnis", () => {
  const r = validateSkinManifest(
    skin({
      limited: {
        layers: [
          { text: "resetsCountdown", at: [10, 10], size: 8, color: "#fff" },
          { text: "commitHash", at: [10, 20], size: 8, color: "#aabbccdd" },
        ],
      },
    }),
  );
  assert.ok("manifest" in r);
});

test("una animación propia con nombre del catálogo se rechaza", () => {
  const e = errorsOf(
    skin(
      { coding: { layers: [layer()] } },
      { animations: { bob: { beats: 1, keyframes: [{ at: 0 }] } } },
    ),
  );
  mention(e, "animations.bob", "serie");
});

test("una animación propia inválida prefija sus errores con su nombre", () => {
  const e = errorsOf(
    skin(
      { coding: { layers: [layer()] } },
      { animations: { mia: { beats: 99, keyframes: [{ at: 0 }] } } },
    ),
  );
  mention(e, "animations.mia.beats");
  mention(
    errorsOf(
      skin({ coding: { layers: [layer()] } }, { animations: { Mia: {} } }),
    ),
    "animations.Mia",
  );
});

test("una proporción distinta de 150×110 es error", () => {
  const e = errorsOf(
    skin({ coding: { layers: [layer()] } }, { size: [100, 100] }),
  );
  mention(e, "size", "proporción");
  const ok = validateSkinManifest(
    skin({ coding: { layers: [layer()] } }, { size: [300, 220] }),
  );
  assert.ok("manifest" in ok);
});

test("estado, dato de texto, rol y campos desconocidos avisan y se ignoran", () => {
  const r = validateSkinManifest({
    futuro: 1,
    states: {
      coding: {
        layers: [
          { ...layer(), role: "tail", extra: true },
          { text: "temperatura", at: [1, 1], size: 8, color: "#fff" },
        ],
      },
      volando: { layers: [layer()] },
    },
  });
  assert.ok("manifest" in r);
  mention(r.warnings, "futuro");
  mention(r.warnings, "states.volando");
  mention(r.warnings, "states.coding.layers[0].role");
  mention(r.warnings, "states.coding.layers[0].extra");
  mention(r.warnings, "states.coding.layers[1].text", "temperatura");
  assert.equal(Object.hasOwn(r.manifest.states, "volando"), false);
  const first = r.manifest.states.coding?.layers[0] ?? {};
  assert.equal("extra" in first, false);
  assert.equal("role" in first, false);
});

test("clip, frames y beats se validan", () => {
  mention(
    errorsOf(skin({ coding: { layers: [layer({ clip: [0, 0, 0, 10] })] } })),
    "layers[0].clip",
  );
  mention(
    errorsOf(skin({ coding: { layers: [layer({ clip: [140, 0, 30, 10] })] } })),
    "layers[0].clip",
  );
  mention(
    errorsOf(skin({ coding: { layers: [layer({ frames: 1 })] } })),
    "layers[0].frames",
  );
  mention(
    errorsOf(skin({ coding: { layers: [layer({ beats: 2 })] } })),
    "layers[0].beats",
    "frames",
  );
  const ok = validateSkinManifest(
    skin({
      coding: {
        layers: [layer({ clip: [10, 10, 40, 30], frames: 4, beats: 2 })],
      },
    }),
  );
  assert.ok("manifest" in ok);
});

test("una capa sin src ni text, o con ambos, se rechaza", () => {
  mention(errorsOf(skin({ coding: { layers: [{}] } })), "layers[0]", "src");
  mention(
    errorsOf(
      skin({ coding: { layers: [{ src: "a.png", text: "commitHash" }] } }),
    ),
    "layers[0]",
    "a la vez",
  );
});

test("sin ningún estado conocido o con un manifest que no es objeto, error", () => {
  mention(errorsOf(skin({ volando: { layers: [layer()] } })), "states");
  mention(errorsOf([]), "objeto");
  mention(errorsOf({}), "states");
});
