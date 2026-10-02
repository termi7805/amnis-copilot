import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureAccount } from "../src/infrastructure/persistence/accounts.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import {
  dailyPeaks,
  insertQuotaSample,
  lastKnownReset,
  samplesBetween,
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

function sample(
  ts: string,
  fiveHourUtil: number | null,
  localUtil = 1,
): Parameters<typeof insertQuotaSample>[1] {
  return {
    accountId: 1,
    ts,
    fiveHourUtil,
    fiveHourResetsAt: null,
    sevenDayUtil: fiveHourUtil === null ? null : 5,
    sevenDayResetsAt: null,
    limitsJson: null,
    localTokens: 0,
    localUtil,
    source: fiveHourUtil === null ? "local" : "both",
    error: null,
  };
}

test("samplesBetween respeta el rango, el orden y trae las dos vías", () => {
  const db = openDb(":memory:");
  ensureAccount(db, "anthropic", "default");
  for (const [ts, u] of [
    ["2026-01-01T12:00:00.000Z", 30],
    ["2026-01-01T10:00:00.000Z", 10],
    ["2026-01-01T11:00:00.000Z", null],
    ["2026-01-01T20:00:00.000Z", 90],
  ] as const) {
    insertQuotaSample(db, sample(ts, u));
  }

  const rows = samplesBetween(
    db,
    1,
    new Date("2026-01-01T09:00:00.000Z"),
    new Date("2026-01-01T12:00:00.000Z"),
  );

  assert.deepEqual(
    rows.map((r) => [r.ts, r.fiveHourUtil]),
    [
      ["2026-01-01T10:00:00.000Z", 10],
      ["2026-01-01T11:00:00.000Z", null],
      ["2026-01-01T12:00:00.000Z", 30],
    ],
  );
});

test("dailyPeaks da el máximo por día e ignora las muestras sin endpoint", () => {
  const db = openDb(":memory:");
  ensureAccount(db, "anthropic", "default");
  for (const [ts, u] of [
    ["2026-01-01T10:00:00.000Z", 10],
    ["2026-01-01T13:00:00.000Z", 70],
    ["2026-01-01T14:00:00.000Z", null],
    ["2026-01-02T01:00:00.000Z", 5],
    ["2026-01-04T09:00:00.000Z", null],
  ] as const) {
    insertQuotaSample(db, sample(ts, u));
  }

  assert.deepEqual(
    dailyPeaks(
      db,
      1,
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-08T00:00:00.000Z"),
    ),
    [
      { day: "2026-01-01", peak: 70 },
      { day: "2026-01-02", peak: 5 },
    ],
  );
});
