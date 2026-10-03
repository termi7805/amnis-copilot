import assert from "node:assert/strict";
import { test } from "node:test";
import type { HealthResponse } from "@amnis/shared";
import { type DiagnoseFacts, diagnose } from "../src/application/diagnose.ts";
import { createHealthRoute } from "../src/infrastructure/http/routes/health.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";

function makeFacts(overrides: Partial<DiagnoseFacts> = {}): DiagnoseFacts {
  return {
    daemonAlive: true,
    amnisHookEvents: ["PreToolUse", "Notification", "Stop"],
    expectedHookEvents: ["PreToolUse", "Notification", "Stop"],
    credentials: { ok: true, expiresAt: null, hasRefreshToken: true },
    quotaError: null,
    dbError: null,
    lastIngestAt: new Date(),
    spotify: { hasClientId: false, token: "none", redirectUri: "http://x/cb" },
    ...overrides,
  };
}

async function getHealth(facts: DiagnoseFacts): Promise<HealthResponse> {
  const server = createHttpServer({
    routes: {
      "GET /api/health": createHealthRoute({
        facts: () => Promise.resolve(facts),
        daemon: () => ({
          version: "0.0.1",
          startedAt: "2026-01-01T00:00:00.000Z",
          eventsReceived: 7,
        }),
      }),
    },
  });
  const port = await server.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);
    return (await response.json()) as HealthResponse;
  } finally {
    await server.close();
  }
}

test("GET /api/health da el diagnóstico de doctor y los datos del proceso", async () => {
  const facts = makeFacts();
  const body = await getHealth(facts);
  assert.deepEqual(body.checks, diagnose(facts, new Date()));
  assert.ok(body.checks.every((c) => c.ok));
  assert.deepEqual(body.daemon, {
    version: "0.0.1",
    startedAt: "2026-01-01T00:00:00.000Z",
    eventsReceived: 7,
  });
});

test("sin Notification: responde 200 con el fallo y su remedio", async () => {
  const body = await getHealth(
    makeFacts({ amnisHookEvents: ["PreToolUse", "Stop"] }),
  );
  const hooks = body.checks.find((c) => c.name === "hooks");
  assert.equal(hooks?.ok, false);
  assert.match(hooks?.message ?? "", /Notification/);
  assert.match(hooks?.remedy ?? "", /amnis install-hooks/);
});
