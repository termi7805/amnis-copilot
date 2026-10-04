import assert from "node:assert/strict";
import { test } from "node:test";
import { checkUpdate } from "../src/application/checkUpdate.ts";

const URL = "https://github.com/termi7805/amnis-copilot/releases/tag/v0.10.0";
const latest = (tag: string) => async () => ({ tag, url: URL });

test("una release más nueva es un aviso con la versión sin v", async () => {
  assert.deepEqual(
    await checkUpdate({
      fetchLatest: latest("v0.10.0"),
      currentVersion: "0.9.0",
    }),
    { update: { version: "0.10.0", url: URL } },
  );
});

test("la misma versión o una anterior no avisan", async () => {
  for (const tag of ["v0.2.0", "v0.1.9"]) {
    assert.deepEqual(
      await checkUpdate({ fetchLatest: latest(tag), currentVersion: "0.2.0" }),
      { update: null },
    );
  }
});

test("un fallo de red o un tag ilegible son error, no «sin versión nueva»", async () => {
  const down = async () => ({ error: "GitHub respondió 403." });
  assert.ok(
    "error" in
      (await checkUpdate({ fetchLatest: down, currentVersion: "0.2.0" })),
  );
  assert.ok(
    "error" in
      (await checkUpdate({
        fetchLatest: latest("nightly"),
        currentVersion: "0.2.0",
      })),
  );
});
