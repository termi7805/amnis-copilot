import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { msg } from "@amnis/shared";

// config.ts lee estas variables al importarse: van antes del import dinámico.
const root = mkdtempSync(join(tmpdir(), "amnis-doctor-"));
process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
process.env.AMNIS_DIR = join(root, "amnis");
mkdirSync(process.env.CLAUDE_CONFIG_DIR, { recursive: true });
mkdirSync(process.env.AMNIS_DIR, { recursive: true });
const { gatherDiagnoseFacts } = await import(
  "../src/infrastructure/doctorFacts.ts"
);
const { openDb } = await import("../src/infrastructure/persistence/db.ts");
const { EXPECTED_HOOK_EVENTS } = await import(
  "../src/application/installHooks.ts"
);

after(() => rmSync(root, { recursive: true, force: true }));

function writeHooks(events: string[]): void {
  const hooks = Object.fromEntries(
    events.map((event) => [
      event,
      [{ hooks: [{ type: "command", command: "/x/amnis-hook.sh" }] }],
    ]),
  );
  writeFileSync(
    join(process.env.CLAUDE_CONFIG_DIR as string, "settings.json"),
    JSON.stringify({ hooks }),
  );
}

const deps = {
  daemonAlive: async () => true,
  quotaError: async () => msg("raw", { text: "boom" }),
  db: openDb(":memory:"),
};
const NOW = new Date("2026-01-02T00:00:00.000Z");

test("los hooks de Amnis salen de settings.json; quitar Notification lo refleja", async () => {
  writeHooks([...EXPECTED_HOOK_EVENTS]);
  const full = await gatherDiagnoseFacts(deps, NOW);
  assert.deepEqual(
    [...full.amnisHookEvents].sort(),
    [...full.expectedHookEvents].sort(),
  );

  writeHooks(["PreToolUse", "Stop"]);
  const missing = await gatherDiagnoseFacts(deps, NOW);
  assert.ok(!missing.amnisHookEvents.includes("Notification"));
});

test("daemonAlive y quotaError vienen de quien llama; la BD inyectada no da error", async () => {
  const facts = await gatherDiagnoseFacts(deps, NOW);
  assert.equal(facts.daemonAlive, true);
  assert.deepEqual(facts.quotaError, msg("raw", { text: "boom" }));
  assert.equal(facts.dbError, null);
  assert.equal(facts.lastIngestAt, null);
});
