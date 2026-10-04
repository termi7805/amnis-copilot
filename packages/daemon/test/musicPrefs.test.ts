import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_MUSIC_PREFS, formatMessage } from "@amnis/shared";
import {
  sanitizeMusicPrefs,
  validateMusicPrefs,
} from "../src/domain/musicPrefs.ts";

const D = DEFAULT_MUSIC_PREFS;

test("un parcial válido se funde sobre las preferencias actuales", () => {
  const result = validateMusicPrefs({ enabled: false, damping: 0.25 }, D);
  assert.ok(result.ok);
  assert.deepEqual(result.prefs, { ...D, enabled: false, damping: 0.25 });
});

test("un objeto vacío no cambia nada", () => {
  const result = validateMusicPrefs({}, D);
  assert.ok(result.ok);
  assert.deepEqual(result.prefs, D);
});

test("los valores válidos de cada campo se aceptan, incluidos los extremos", () => {
  const cases: Record<string, unknown[]> = {
    enabled: [true, false],
    motion: ["head", "accessory"],
    damping: [0, 1, 0.05],
    color: ["vibe", "cover", "teal"],
    fallback: ["neutral", "quiet"],
    screen: ["two-phase", "cover", "cover-title", "pixel", "text", "none"],
    screenSeconds: [2, 8, 6.5],
    screenEntry: ["tv", "fade"],
    scanlines: [true, false],
  };
  for (const [field, values] of Object.entries(cases)) {
    for (const value of values) {
      const result = validateMusicPrefs({ [field]: value }, D);
      assert.ok(result.ok, `${field}=${String(value)}`);
    }
  }
});

test("cada campo inválido responde con su nombre", () => {
  const bad: [string, unknown][] = [
    ["enabled", "yes"],
    ["motion", "feet"],
    ["damping", 1.5],
    ["damping", -0.1],
    ["damping", "0.7"],
    ["color", "red"],
    ["fallback", null],
    ["screen", "banner"],
    ["screenSeconds", 1.9],
    ["screenSeconds", 8.5],
    ["screenSeconds", Number.NaN],
    ["screenEntry", "spin"],
    ["scanlines", 1],
  ];
  for (const [field, value] of bad) {
    const result = validateMusicPrefs({ [field]: value }, D);
    assert.ok(!result.ok, `${field}=${String(value)}`);
    assert.equal(result.field, field);
    assert.match(formatMessage("es", result.message), new RegExp(field));
  }
});

test("un campo desconocido se rechaza: un typo no puede pasar por guardado", () => {
  const result = validateMusicPrefs({ enable: false }, D);
  assert.ok(!result.ok);
  assert.equal(result.field, "enable");
});

test("si un campo falla no se aplica ninguno (la validación es atómica)", () => {
  const result = validateMusicPrefs({ enabled: false, damping: 9 }, D);
  assert.ok(!result.ok);
  assert.equal(result.field, "damping");
});

test("el body debe ser un objeto", () => {
  for (const body of [null, 3, "x", [1], undefined]) {
    const result = validateMusicPrefs(body, D);
    assert.ok(!result.ok);
    assert.equal(result.field, "body");
  }
});

test("sanitize: lo ausente o inválido va a su valor por defecto, lo válido se conserva", () => {
  const prefs = sanitizeMusicPrefs({
    enabled: false,
    damping: "mucho",
    screen: "text",
    screenSeconds: 99,
    extra: "ignorado",
  });
  assert.equal(prefs.enabled, false);
  assert.equal(prefs.screen, "text");
  assert.equal(prefs.damping, D.damping);
  assert.equal(prefs.screenSeconds, D.screenSeconds);
  assert.equal("extra" in prefs, false);
});

test("sanitize: cualquier cosa que no sea un objeto da los valores por defecto", () => {
  for (const raw of [null, undefined, 7, "x", [1, 2], true]) {
    assert.deepEqual(sanitizeMusicPrefs(raw), D);
  }
});
