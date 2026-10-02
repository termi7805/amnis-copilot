import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureAccount } from "../src/infrastructure/persistence/accounts.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import {
  insertQuotaSample,
  lastKnownReset,
} from "../src/infrastructure/persistence/quotaSamples.ts";

test("insertQuotaSample persiste una fila con las dos vías y la divergencia calculada aparte", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertQuotaSample(db, {
    accountId,
    ts: "2026-01-01T10:00:00.000Z",
    fiveHourUtil: 42,
    fiveHourResetsAt: "2026-01-01T15:00:00.000Z",
    sevenDayUtil: 20,
    sevenDayResetsAt: "2026-01-08T00:00:00.000Z",
    limitsJson: null,
    localTokens: 1000,
    localUtil: 38,
    source: "both",
    error: null,
  });

  const row = db.prepare("SELECT * FROM quota_samples").get() as Record<
    string,
    unknown
  >;
  assert.equal(row.five_hour_util, 42);
  assert.equal(row.local_tokens, 1000);
  assert.equal(row.source, "both");
});

test("lastKnownReset devuelve el five_hour_resets_at no nulo más reciente, ignorando muestras sin endpoint", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  const base = {
    accountId,
    fiveHourUtil: null,
    sevenDayUtil: null,
    sevenDayResetsAt: null,
    limitsJson: null,
    localTokens: 0,
    localUtil: 0,
    source: "local" as const,
    error: null,
  };

  insertQuotaSample(db, {
    ...base,
    ts: "2026-01-01T08:00:00.000Z",
    fiveHourResetsAt: "2026-01-01T13:00:00.000Z",
    source: "both",
    fiveHourUtil: 10,
  });
  insertQuotaSample(db, {
    ...base,
    ts: "2026-01-01T09:00:00.000Z",
    fiveHourResetsAt: null,
  });
  insertQuotaSample(db, {
    ...base,
    ts: "2026-01-01T10:00:00.000Z",
    fiveHourResetsAt: "2026-01-01T15:00:00.000Z",
    source: "both",
    fiveHourUtil: 30,
  });

  assert.equal(lastKnownReset(db, accountId), "2026-01-01T15:00:00.000Z");
});

test("lastKnownReset devuelve null si no hay ninguna muestra autoritativa", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertQuotaSample(db, {
    accountId,
    ts: "2026-01-01T08:00:00.000Z",
    fiveHourUtil: null,
    fiveHourResetsAt: null,
    sevenDayUtil: null,
    sevenDayResetsAt: null,
    limitsJson: null,
    localTokens: 0,
    localUtil: 0,
    source: "local",
    error: null,
  });

  assert.equal(lastKnownReset(db, accountId), null);
});
