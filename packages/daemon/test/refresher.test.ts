import assert from "node:assert/strict";
import { test } from "node:test";
import { startRefresher } from "../src/infrastructure/refresher.ts";

test("arranca con una pasada y runNow no solapa una en vuelo", async () => {
  let calls = 0;
  let release: () => void = () => {};
  const refresher = startRefresher({
    intervalMs: 60_000,
    refresh: () => {
      calls++;
      return new Promise((resolve) => {
        release = () => resolve({ error: null });
      });
    },
  });
  assert.equal(calls, 1);
  refresher.runNow();
  assert.equal(calls, 1);
  release();
  await new Promise((r) => setImmediate(r));
  refresher.runNow();
  assert.equal(calls, 2);
  release();
  refresher.stop();
});
