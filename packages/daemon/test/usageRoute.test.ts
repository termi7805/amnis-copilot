import assert from "node:assert/strict";
import { test } from "node:test";
import { createUsageRoute } from "../src/infrastructure/http/routes/usage.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";
import { ensureAccount } from "../src/infrastructure/persistence/accounts.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import { insertUsageEvent } from "../src/infrastructure/persistence/usageEvents.ts";

test("GET /api/usage responde tipado y con el coste calculado", async () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  insertUsageEvent(db, {
    accountId,
    provider: "anthropic",
    dedupeKey: "a",
    sessionId: null,
    project: "/repo",
    ts: "2026-01-01T00:00:00.000Z",
    model: "claude-sonnet-5",
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    serviceTier: null,
  });

  const server = createHttpServer({
    routes: { "GET /api/usage": createUsageRoute(db, accountId) },
  });
  const port = await server.listen(0);
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/usage?groupBy=project`,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      groupBy: string;
      rows: { costUsd: number }[];
    };
    assert.equal(body.groupBy, "project");
    assert.equal(body.rows[0]?.costUsd, 3.0);
  } finally {
    await server.close();
  }
});

test("un groupBy inválido responde 400 en JSON", async () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  const server = createHttpServer({
    routes: { "GET /api/usage": createUsageRoute(db, accountId) },
  });
  const port = await server.listen(0);
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/usage?groupBy=nope`,
    );
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("content-type"), "application/json");
  } finally {
    await server.close();
  }
});

test("un from inválido responde 400 en vez de un rango vacío silencioso", async () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  const server = createHttpServer({
    routes: { "GET /api/usage": createUsageRoute(db, accountId) },
  });
  const port = await server.listen(0);
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/usage?from=no-es-una-fecha`,
    );
    assert.equal(response.status, 400);
  } finally {
    await server.close();
  }
});
