import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { ensureAccount } from "../src/infrastructure/persistence/accounts.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import {
  tokensInWindow,
  usageTimestamps,
} from "../src/infrastructure/persistence/usage.ts";
import { insertUsageEvent } from "../src/infrastructure/persistence/usageEvents.ts";

function insertEvent(
  db: ReturnType<typeof openDb>,
  accountId: number,
  dedupeKey: string,
  ts: string,
  tokens: {
    input: number;
    output: number;
    cacheCreation?: number;
    cacheRead?: number;
  },
): void {
  insertUsageEvent(db, {
    accountId,
    provider: "anthropic",
    dedupeKey,
    sessionId: null,
    project: null,
    ts,
    model: null,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    cacheCreationTokens: tokens.cacheCreation ?? 0,
    cacheReadTokens: tokens.cacheRead ?? 0,
    serviceTier: null,
    gitBranch: null,
  });
}

test("tokensInWindow suma las cuatro columnas desde `since`, ignora eventos anteriores", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertEvent(db, accountId, "a", "2026-01-01T00:00:00.000Z", {
    input: 100,
    output: 50,
  }); // fuera de ventana
  insertEvent(db, accountId, "b", "2026-01-01T11:00:00.000Z", {
    input: 200,
    output: 100,
    cacheCreation: 10,
    cacheRead: 5,
  });
  insertEvent(db, accountId, "c", "2026-01-01T12:00:00.000Z", {
    input: 300,
    output: 150,
  });

  const total = tokensInWindow(
    db,
    accountId,
    new Date("2026-01-01T10:00:00.000Z"),
  );

  assert.equal(total, 200 + 100 + 10 + 5 + 300 + 150);
});

test("tokensInWindow devuelve 0 si no hay eventos en la ventana", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  const total = tokensInWindow(
    db,
    accountId,
    new Date("2026-01-01T00:00:00.000Z"),
  );

  assert.equal(total, 0);
});

test("usageTimestamps devuelve los ts en orden ascendente", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertEvent(db, accountId, "b", "2026-01-01T12:00:00.000Z", {
    input: 1,
    output: 1,
  });
  insertEvent(db, accountId, "a", "2026-01-01T10:00:00.000Z", {
    input: 1,
    output: 1,
  });

  const timestamps = usageTimestamps(db, accountId);

  assert.equal(timestamps.length, 2);
  assert.ok(timestamps[0] && timestamps[1]);
  assert.ok(timestamps[0].getTime() < timestamps[1].getTime());
});

test("la migración añade plan_window_tokens y es idempotente", () => {
  const dir = mkdtempSync(join(tmpdir(), "amnis-migration-"));
  try {
    const dbPath = join(dir, "test.sqlite");

    const db1 = openDb(dbPath);
    const columns = db1.prepare("PRAGMA table_info(accounts)").all() as {
      name: string;
    }[];
    assert.ok(columns.some((c) => c.name === "plan_window_tokens"));
    db1.close();

    // Reabrir el mismo fichero ya migrado: la columna ya existe, migrate()
    // no debe intentar volver a añadirla.
    assert.doesNotThrow(() => {
      const db2 = openDb(dbPath);
      db2.close();
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("la migración añade limits_json a quota_samples y conserva las filas", () => {
  const dir = mkdtempSync(join(tmpdir(), "amnis-migration-"));
  try {
    const dbPath = join(dir, "old.sqlite");

    // BD con el esquema anterior: sin limits_json y con una muestra.
    const old = new DatabaseSync(dbPath);
    old.exec(`
      CREATE TABLE accounts (id INTEGER PRIMARY KEY, provider TEXT, label TEXT, plan TEXT);
      CREATE TABLE quota_samples (
        id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL, ts TEXT NOT NULL,
        five_hour_util REAL, five_hour_resets_at TEXT, seven_day_util REAL,
        seven_day_resets_at TEXT, opus_util REAL, local_tokens INTEGER NOT NULL,
        local_util REAL NOT NULL, source TEXT NOT NULL, error TEXT
      );
      INSERT INTO quota_samples (account_id, ts, local_tokens, local_util, source)
        VALUES (1, '2026-07-01T00:00:00Z', 10, 1, 'local');
    `);
    old.close();

    for (let i = 0; i < 2; i++) {
      const db = openDb(dbPath);
      const columns = db.prepare("PRAGMA table_info(quota_samples)").all() as {
        name: string;
      }[];
      assert.ok(columns.some((c) => c.name === "limits_json"));
      assert.ok(columns.some((c) => c.name === "opus_util"));
      const row = db
        .prepare("SELECT COUNT(*) AS n FROM quota_samples")
        .get() as {
        n: number;
      };
      assert.equal(row.n, 1);
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
