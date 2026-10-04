import assert from "node:assert/strict";
import { test } from "node:test";
import type { UpdateInfo } from "@amnis/shared";
import { createUpdateChecker } from "../src/infrastructure/updateChecker.ts";

const NEW: UpdateInfo = {
  version: "9.9.9",
  url: "https://github.com/termi7805/amnis-copilot/releases/tag/v9.9.9",
};

function setup(
  results: Array<{ update: UpdateInfo | null } | { error: string }>,
) {
  let enabled = true;
  let calls = 0;
  const changes: Array<UpdateInfo | null> = [];
  const checker = createUpdateChecker({
    check: async () => {
      const result = results[calls] ?? results.at(-1);
      calls++;
      assert.ok(result);
      return result;
    },
    enabled: () => enabled,
    onChange: (update) => changes.push(update),
  });
  return {
    checker,
    changes,
    calls: () => calls,
    setEnabled: (value: boolean) => {
      enabled = value;
    },
  };
}

test("apagado no hace ninguna petición", async () => {
  const s = setup([{ update: NEW }]);
  s.setEnabled(false);
  await s.checker.refresh();
  await s.checker.refresh();
  assert.equal(s.calls(), 0);
  assert.equal(s.checker.current(), null);
});

test("avisa una vez por cambio y apagar borra el aviso", async () => {
  const s = setup([{ update: NEW }]);
  await s.checker.refresh();
  await s.checker.refresh();
  assert.deepEqual(s.changes, [NEW]);
  assert.deepEqual(s.checker.current(), NEW);

  s.setEnabled(false);
  await s.checker.refresh();
  assert.deepEqual(s.changes, [NEW, null]);
  assert.equal(s.checker.current(), null);
});

test("un error conserva el último aviso bueno", async () => {
  const s = setup([{ update: NEW }, { error: "GitHub respondió 403." }]);
  await s.checker.refresh();
  const result = await s.checker.refresh();
  assert.equal(result.error, "GitHub respondió 403.");
  assert.deepEqual(s.checker.current(), NEW);
  assert.deepEqual(s.changes, [NEW]);
});
