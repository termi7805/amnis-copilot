import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureAccount } from "../src/infrastructure/persistence/accounts.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import {
  countUsageEvents,
  insertUsageEvent,
} from "../src/infrastructure/persistence/usageEvents.ts";

test("countUsageEvents devuelve 0 sin eventos", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  assert.equal(countUsageEvents(db, accountId), 0);
});

test("countUsageEvents cuenta solo los de la cuenta indicada", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  const otherAccountId = ensureAccount(db, "anthropic", "otra");

  insertUsageEvent(db, {
    accountId,
    provider: "anthropic",
    dedupeKey: "a",
    sessionId: null,
    project: null,
    ts: "2026-01-01T00:00:00.000Z",
    model: "claude-sonnet-5",
    inputTokens: 1,
    outputTokens: 1,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    serviceTier: null,
    gitBranch: null,
  });
  insertUsageEvent(db, {
    accountId,
    provider: "anthropic",
    dedupeKey: "b",
    sessionId: null,
    project: null,
    ts: "2026-01-01T00:01:00.000Z",
    model: "claude-sonnet-5",
    inputTokens: 1,
    outputTokens: 1,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    serviceTier: null,
    gitBranch: null,
  });
  insertUsageEvent(db, {
    accountId: otherAccountId,
    provider: "anthropic",
    dedupeKey: "c",
    sessionId: null,
    project: null,
    ts: "2026-01-01T00:02:00.000Z",
    model: "claude-sonnet-5",
    inputTokens: 1,
    outputTokens: 1,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    serviceTier: null,
    gitBranch: null,
  });

  assert.equal(countUsageEvents(db, accountId), 2);
});
