import assert from "node:assert/strict";
import { test } from "node:test";
import { isNewer, parseVersion } from "../src/domain/version.ts";

test("parseVersion acepta X.Y.Z con o sin v y nada más", () => {
  assert.deepEqual(parseVersion("v0.10.0"), [0, 10, 0]);
  assert.deepEqual(parseVersion("1.2.3"), [1, 2, 3]);
  assert.equal(parseVersion("v1.0.0-rc.1"), null);
  assert.equal(parseVersion("v1.0"), null);
  assert.equal(parseVersion("latest"), null);
  assert.equal(parseVersion(""), null);
});

test("isNewer compara número a número, no como texto", () => {
  assert.equal(isNewer([0, 10, 0], [0, 9, 0]), true);
  assert.equal(isNewer([1, 0, 0], [0, 99, 99]), true);
  assert.equal(isNewer([0, 2, 1], [0, 2, 0]), true);
  assert.equal(isNewer([0, 2, 0], [0, 2, 0]), false);
  assert.equal(isNewer([0, 1, 9], [0, 2, 0]), false);
});
