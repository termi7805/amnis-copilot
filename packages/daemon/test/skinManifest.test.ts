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

const head = (extra: object = {}) =>
  layer({ role: "head", anchor: [55, 46], ...extra });

test("dos capas head en el mismo estado se rechazan", () => {
  const e = errorsOf(
    skin({
      music: { layers: [] },
      coding: { layers: [head(), layer(), head()] },
    }),
  );
  mention(e, "states.coding", "head");
});

test("head en estados distintos está bien", () => {
  const r = validateSkinManifest(
    skin({
      coding: { layers: [head()] },
      testing: { layers: [head()] },
    }),
  );
  assert.ok("manifest" in r);
});

test("una capa head sin anchor se rechaza", () => {
  const e = errorsOf(skin({ coding: { layers: [layer({ role: "head" })] } }));
  mention(e, "states.coding.layers[0].anchor", "anchor");
});

test("anchor fuera de la escena o mal formado se rechaza", () => {
  for (const anchor of [[200, 46], [55, -1], [55], "55,46"]) {
    const e = errorsOf(skin({ coding: { layers: [head({ anchor })] } }));
    mention(e, "states.coding.layers[0].anchor");
  }
});

test("scale de la capa head: entre 0 (excluido) y 4", () => {
  for (const scale of [0, -1, 5, "2", Number.NaN]) {
    const e = errorsOf(skin({ coding: { layers: [head({ scale })] } }));
    mention(e, "states.coding.layers[0].scale");
  }
  const r = validateSkinManifest(
    skin({ coding: { layers: [head({ scale: 1.5 })] } }),
  );
  assert.ok("manifest" in r);
  const l = r.manifest.states.coding?.layers[0];
  assert.ok(l && "src" in l);
  assert.deepEqual(l.anchor, [55, 46]);
  assert.equal(l.scale, 1.5);
});

test("anchor y scale sin role head avisan y no pasan al manifest", () => {
  const r = validateSkinManifest(
    skin({ coding: { layers: [layer({ anchor: [10, 10], scale: 2 })] } }),
  );
  assert.ok("manifest" in r);
  assert.equal(r.warnings.length, 2);
  assert.ok(r.warnings.every((w) => w.includes('role "head"')));
  const l = r.manifest.states.coding?.layers[0];
  assert.ok(l && "src" in l);
  assert.equal(l.anchor, undefined);
  assert.equal(l.scale, undefined);
});

const player = (extra: object = {}) =>
  layer({ role: "player", anchor: [110, 70], ...extra });

test("una capa player sin anchor se rechaza", () => {
  const e = errorsOf(skin({ coding: { layers: [layer({ role: "player" })] } }));
  mention(e, "states.coding.layers[0].anchor", "player");
});

test("dos capas player en el mismo estado se rechazan", () => {
  const e = errorsOf(skin({ coding: { layers: [player(), player()] } }));
  mention(e, "states.coding", 'role "player"');
});

test("player con anchor y scale pasa al manifest, con head o sin ella", () => {
  const r = validateSkinManifest(
    skin({
      coding: { layers: [head(), player({ scale: 0.8 })] },
      testing: { layers: [player()] },
    }),
  );
  assert.ok("manifest" in r);
  assert.deepEqual(r.warnings, []);
  const l = r.manifest.states.coding?.layers[1];
  assert.ok(l && "src" in l);
  assert.equal(l.role, "player");
  assert.deepEqual(l.anchor, [110, 70]);
  assert.equal(l.scale, 0.8);
});

test("headphones y player de la head: solo booleanos, y solo se guardan apagados", () => {
  for (const key of ["headphones", "player"]) {
    const e = errorsOf(skin({ coding: { layers: [head({ [key]: "no" })] } }));
    mention(e, `states.coding.layers[0].${key}`);
  }
  const r = validateSkinManifest(
    skin({
      coding: { layers: [head({ headphones: false, player: false })] },
      testing: { layers: [head({ headphones: true, player: true })] },
    }),
  );
  assert.ok("manifest" in r);
  const off = r.manifest.states.coding?.layers[0];
  const on = r.manifest.states.testing?.layers[0];
  assert.ok(off && "src" in off && on && "src" in on);
  assert.equal(off.headphones, false);
  assert.equal(off.player, false);
  assert.ok(!("headphones" in on) && !("player" in on));
});

test("headphones y player fuera de la head avisan y no pasan", () => {
  const r = validateSkinManifest(
    skin({
      coding: {
        layers: [
          layer({ headphones: false }),
          player({ player: false, headphones: false }),
        ],
      },
    }),
  );
  assert.ok("manifest" in r);
  assert.equal(r.warnings.length, 3);
  for (const l of r.manifest.states.coding?.layers ?? []) {
    assert.ok("src" in l);
    assert.ok(!("headphones" in l) && !("player" in l));
  }
});

test("player: false en la head avisa si el estado ya tiene capa player", () => {
  const r = validateSkinManifest(
    skin({ coding: { layers: [head({ player: false }), player()] } }),
  );
  assert.ok("manifest" in r);
  assert.equal(r.warnings.length, 1);
  assert.ok(r.warnings[0]?.includes("states.coding.layers[0].player"));
});

test("un manifest con head de antes queda igual: sin campos de cascos ni reproductor", () => {
  const r = validateSkinManifest(
    skin({ coding: { layers: [head({ scale: 1.2, pivot: [55, 60] })] } }),
  );
  assert.ok("manifest" in r);
  assert.deepEqual(r.manifest.states.coding?.layers[0], {
    src: "coding/body.png",
    pivot: [55, 60],
    role: "head",
    anchor: [55, 46],
    scale: 1.2,
  });
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
