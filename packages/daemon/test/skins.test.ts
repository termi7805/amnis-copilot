import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkSkin,
  listSkins,
  type SkinFolder,
} from "../src/application/skins.ts";

const manifest = (extra: object = {}) =>
  JSON.stringify({
    states: {
      coding: { layers: [{ src: "coding/body.png" }, { src: "head.png" }] },
      resting: { layers: [{ src: "zzz.png" }] },
    },
    ...extra,
  });

const folder = (text: string | null, images: string[]): SkinFolder => ({
  readManifest: () => text,
  hasImage: (src) => images.includes(src),
});

const ALL_IMAGES = ["coding/body.png", "head.png", "zzz.png"];

test("una skin completa carga con su nombre", () => {
  const r = checkSkin(folder(manifest({ name: "Robi" }), ALL_IMAGES));
  assert.deepEqual(r.errors, []);
  assert.equal(r.manifest?.name, "Robi");
});

test("una imagen que falta se nombra con estado, capa y ruta", () => {
  const r = checkSkin(folder(manifest(), ["coding/body.png", "zzz.png"]));
  assert.equal(r.manifest, undefined);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0] ?? "", /states\.coding\.layers\[1\]\.src/);
  assert.match(r.errors[0] ?? "", /head\.png/);
});

test("sin skin.json y con JSON roto se explica, no se lanza", () => {
  assert.match(checkSkin(folder(null, [])).errors[0] ?? "", /skin\.json/);
  assert.match(checkSkin(folder("{", [])).errors[0] ?? "", /JSON/);
});

test("los errores del validador pasan tal cual", () => {
  const r = checkSkin(folder(JSON.stringify({ states: {} }), []));
  assert.ok(r.errors.some((e) => e.startsWith("states")));
});

test("una skin que lanza se lista con su error y no tumba el resto", () => {
  const all = listSkins({
    skinIds: () => ["rota", "buena", "ilegible"],
    folder: (id) => {
      if (id === "ilegible") {
        return {
          readManifest: () => {
            throw new Error("EACCES");
          },
          hasImage: () => false,
        };
      }
      return id === "buena"
        ? folder(manifest({ name: "Buena" }), ALL_IMAGES)
        : folder(manifest(), []);
    },
  });
  assert.deepEqual(
    all.map((s) => s.id),
    ["buena", "ilegible", "rota"],
  );
  assert.deepEqual(all[0]?.states, ["coding", "resting"]);
  assert.equal(all[0]?.name, "Buena");
  assert.match(all[1]?.errors[0] ?? "", /EACCES/);
  assert.ok((all[2]?.errors.length ?? 0) > 0);
  assert.deepEqual(all[2]?.states, []);
});
