import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveVibe } from "../src/domain/vibe.ts";

const f = (energy: number, valence: number) => ({ energy, valence });

test("los cuatro cuadrantes", () => {
  assert.equal(deriveVibe(f(0.8, 0.8), "track"), "fiesta");
  assert.equal(deriveVibe(f(0.8, 0.2), "track"), "intensa");
  assert.equal(deriveVibe(f(0.2, 0.8), "track"), "chill");
  assert.equal(deriveVibe(f(0.2, 0.2), "track"), "melancolica");
});

test("el corte 0,5 cuenta como alto, en los dos ejes", () => {
  assert.equal(deriveVibe(f(0.5, 0.5), "track"), "fiesta");
  assert.equal(deriveVibe(f(0.5, 0.49), "track"), "intensa");
  assert.equal(deriveVibe(f(0.49, 0.5), "track"), "chill");
  assert.equal(deriveVibe(f(0.49, 0.49), "track"), "melancolica");
});

test("un episodio es podcast aunque haya features", () => {
  assert.equal(deriveVibe(f(0.9, 0.9), "episode"), "podcast");
  assert.equal(deriveVibe(null, "episode"), "podcast");
});

test("sin datos, o con datos que no son números, es neutral", () => {
  assert.equal(deriveVibe(null, "track"), "neutral");
  assert.equal(deriveVibe(f(Number.NaN, 0.5), "track"), "neutral");
  assert.equal(
    deriveVibe(f(0.5, Number.POSITIVE_INFINITY), "track"),
    "neutral",
  );
});
