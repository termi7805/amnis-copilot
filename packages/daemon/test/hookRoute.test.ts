import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import type { HookEventInput } from "../src/application/recordHook.ts";
import { createHookRoute } from "../src/infrastructure/http/routes/hook.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";

async function withHookServer(
  inserted: HookEventInput[],
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const route = createHookRoute({
    normalizeHookEvent: (raw) => {
      const payload = raw as Record<string, unknown>;
      if (typeof payload?.hook_event_name !== "string") return null;
      return {
        provider: "anthropic",
        hook: payload.hook_event_name,
        toolName: null,
        sessionId: null,
        project: null,
        permissionMode: null,
        command: null,
        at: new Date().toISOString(),
      };
    },
    deriveState: () => "unknown",
    insertHookEvent: (event) => inserted.push(event),
  });

  const server = createHttpServer({
    routes: { "POST /api/hook/claude": route },
  });
  const port = await server.listen(0);
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await server.close();
  }
}

test("un payload válido queda insertado tras la respuesta", async () => {
  const inserted: HookEventInput[] = [];
  await withHookServer(inserted, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/hook/claude`, {
      method: "POST",
      body: JSON.stringify({ hook_event_name: "PreToolUse" }),
    });
    assert.equal(response.status, 200);

    // El script del hook nunca espera esto: es la prueba de que el 200
    // ya salió antes de que la escritura ocurriera.
    await sleep(20);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0]?.hook, "PreToolUse");
  });
});

test("un payload malformado responde 200 y no inserta nada, el servidor sigue vivo", async () => {
  const inserted: HookEventInput[] = [];
  await withHookServer(inserted, async (baseUrl) => {
    const badResponse = await fetch(`${baseUrl}/api/hook/claude`, {
      method: "POST",
      body: "esto no es JSON",
    });
    assert.equal(badResponse.status, 200);
    await sleep(20);
    assert.equal(inserted.length, 0);

    const goodResponse = await fetch(`${baseUrl}/api/hook/claude`, {
      method: "POST",
      body: JSON.stringify({ hook_event_name: "Stop" }),
    });
    assert.equal(goodResponse.status, 200);
    await sleep(20);
    assert.equal(inserted.length, 1);
  });
});

test("un payload JSON válido pero no normalizable responde 200 y no inserta nada", async () => {
  const inserted: HookEventInput[] = [];
  await withHookServer(inserted, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/hook/claude`, {
      method: "POST",
      body: JSON.stringify(["no", "es", "un", "objeto", "de", "hook"]),
    });
    assert.equal(response.status, 200);
    await sleep(20);
    assert.equal(inserted.length, 0);
  });
});
