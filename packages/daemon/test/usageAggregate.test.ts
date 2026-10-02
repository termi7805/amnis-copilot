import assert from "node:assert/strict";
import { test } from "node:test";
import { SEED_PRICES } from "../src/domain/cost.ts";
import { ensureAccount } from "../src/infrastructure/persistence/accounts.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import { aggregate } from "../src/infrastructure/persistence/usage.ts";
import { insertUsageEvent } from "../src/infrastructure/persistence/usageEvents.ts";

function insertEvent(
  db: ReturnType<typeof openDb>,
  accountId: number,
  opts: {
    dedupeKey: string;
    ts: string;
    project: string | null;
    model: string | null;
    input: number;
    output: number;
    cacheCreation?: number;
    cacheRead?: number;
  },
): void {
  insertUsageEvent(db, {
    accountId,
    provider: "anthropic",
    dedupeKey: opts.dedupeKey,
    sessionId: null,
    project: opts.project,
    ts: opts.ts,
    model: opts.model,
    inputTokens: opts.input,
    outputTokens: opts.output,
    cacheCreationTokens: opts.cacheCreation ?? 0,
    cacheReadTokens: opts.cacheRead ?? 0,
    serviceTier: null,
  });
}

test("los totales por proyecto cuadran con la suma de los eventos crudos", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertEvent(db, accountId, {
    dedupeKey: "a",
    ts: "2026-01-01T10:00:00.000Z",
    project: "/repo/a",
    model: "claude-sonnet-5",
    input: 100,
    output: 50,
  });
  insertEvent(db, accountId, {
    dedupeKey: "b",
    ts: "2026-01-01T11:00:00.000Z",
    project: "/repo/a",
    model: "claude-sonnet-5",
    input: 200,
    output: 100,
  });
  insertEvent(db, accountId, {
    dedupeKey: "c",
    ts: "2026-01-01T12:00:00.000Z",
    project: "/repo/b",
    model: "claude-opus-5",
    input: 1000,
    output: 0,
  });

  const { rows } = aggregate(
    db,
    accountId,
    { groupBy: "project" },
    SEED_PRICES,
  );

  const repoA = rows.find((r) => r.key === "/repo/a");
  assert.ok(repoA);
  assert.equal(repoA.inputTokens, 300);
  assert.equal(repoA.outputTokens, 150);

  const repoB = rows.find((r) => r.key === "/repo/b");
  assert.ok(repoB);
  assert.equal(repoB.inputTokens, 1000);
});

test("group by model combina el coste correcto cuando un grupo mezcla modelos con precios distintos", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertEvent(db, accountId, {
    dedupeKey: "sonnet",
    ts: "2026-01-01T10:00:00.000Z",
    project: "/repo",
    model: "claude-sonnet-5",
    input: 1_000_000,
    output: 0,
  });
  insertEvent(db, accountId, {
    dedupeKey: "opus",
    ts: "2026-01-01T11:00:00.000Z",
    project: "/repo",
    model: "claude-opus-5",
    input: 1_000_000,
    output: 0,
  });

  // Agrupado por día (misma fecha, dos modelos): el coste debe ser la suma
  // de cada modelo a SU precio, no los 2M tokens al precio de uno solo.
  const { rows } = aggregate(db, accountId, { groupBy: "day" }, SEED_PRICES);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.costUsd, 2.0 + 5.0);
});

test("el filtro from/to excluye lo que queda fuera del rango", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertEvent(db, accountId, {
    dedupeKey: "dentro",
    ts: "2026-01-05T00:00:00.000Z",
    project: "/repo",
    model: "claude-sonnet-5",
    input: 100,
    output: 0,
  });
  insertEvent(db, accountId, {
    dedupeKey: "antes",
    ts: "2026-01-01T00:00:00.000Z",
    project: "/repo",
    model: "claude-sonnet-5",
    input: 999,
    output: 0,
  });
  insertEvent(db, accountId, {
    dedupeKey: "despues",
    ts: "2026-01-10T00:00:00.000Z",
    project: "/repo",
    model: "claude-sonnet-5",
    input: 999,
    output: 0,
  });

  const { rows } = aggregate(
    db,
    accountId,
    {
      groupBy: "project",
      from: new Date("2026-01-02T00:00:00.000Z"),
      to: new Date("2026-01-08T00:00:00.000Z"),
    },
    SEED_PRICES,
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.inputTokens, 100);
});

test("modelo null no se descarta: aparece agrupado bajo su propia clave con coste 0", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertEvent(db, accountId, {
    dedupeKey: "sin-modelo",
    ts: "2026-01-01T00:00:00.000Z",
    project: "/repo",
    model: null,
    input: 100,
    output: 50,
  });

  const { rows, unpricedModels } = aggregate(
    db,
    accountId,
    { groupBy: "model" },
    SEED_PRICES,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.inputTokens, 100);
  assert.equal(rows[0]?.costUsd, 0);
  // null no es un modelo sin precio: no hay nombre que listar.
  assert.deepEqual(unpricedModels, []);
});

test("un modelo con tokens y sin precio sale en unpricedModels en vez de pasar por barato", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertEvent(db, accountId, {
    dedupeKey: "nuevo",
    ts: "2026-01-01T00:00:00.000Z",
    project: "/repo",
    model: "claude-modelo-futuro",
    input: 100,
    output: 0,
  });
  insertEvent(db, accountId, {
    dedupeKey: "haiku",
    ts: "2026-01-01T00:00:00.000Z",
    project: "/repo",
    model: "claude-haiku-4-5-20251001",
    input: 100,
    output: 0,
  });

  const { unpricedModels } = aggregate(
    db,
    accountId,
    { groupBy: "day" },
    SEED_PRICES,
  );
  assert.deepEqual(unpricedModels, ["claude-modelo-futuro"]);
});
