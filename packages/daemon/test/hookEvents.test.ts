import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureAccount } from "../src/infrastructure/persistence/accounts.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import {
  countHookEvents,
  eventsBetween,
  insertHookEvent,
  lastKnownStateEvent,
} from "../src/infrastructure/persistence/hookEvents.ts";

function insert(
  db: ReturnType<typeof openDb>,
  accountId: number,
  ts: string,
  derivedState: string,
  overrides: {
    hook?: string;
    toolName?: string | null;
    project?: string | null;
  } = {},
): void {
  insertHookEvent(db, {
    accountId,
    provider: "anthropic",
    ts,
    hook: overrides.hook ?? "PreToolUse",
    toolName: overrides.toolName ?? "Edit",
    sessionId: null,
    project: overrides.project ?? null,
    derivedState,
  });
}

test("lastKnownStateEvent devuelve null sin eventos", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  assert.equal(lastKnownStateEvent(db, accountId), null);
});

test("lastKnownStateEvent ignora eventos con derived_state = unknown", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  insert(db, accountId, "2026-01-01T00:00:00.000Z", "coding");
  insert(db, accountId, "2026-01-01T00:01:00.000Z", "unknown", {
    hook: "UserPromptSubmit",
    toolName: null,
  });

  const last = lastKnownStateEvent(db, accountId);

  assert.equal(last?.derivedState, "coding");
});

test("lastKnownStateEvent devuelve el más reciente por ts", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  insert(db, accountId, "2026-01-01T00:00:00.000Z", "researching", {
    toolName: "Read",
  });
  insert(db, accountId, "2026-01-01T00:05:00.000Z", "coding", {
    toolName: "Edit",
  });

  const last = lastKnownStateEvent(db, accountId);

  assert.equal(last?.derivedState, "coding");
  assert.equal(last?.ts, "2026-01-01T00:05:00.000Z");
});

test("lastKnownStateEvent devuelve el project del evento — de ahí sale el cwd para leer HEAD", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  insert(db, accountId, "2026-01-01T00:00:00.000Z", "pushing", {
    toolName: "Bash",
    project: "/home/termi/amnis-copilot",
  });

  const last = lastKnownStateEvent(db, accountId);

  assert.equal(last?.project, "/home/termi/amnis-copilot");
});

test("stateEnteredAt es el primer evento de la racha, no el último — varios PreToolUse seguidos en el mismo estado no lo reinician", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  insert(db, accountId, "2026-01-01T00:00:00.000Z", "coding", {
    toolName: "Edit",
  });
  insert(db, accountId, "2026-01-01T00:05:00.000Z", "coding", {
    toolName: "Write",
  });
  insert(db, accountId, "2026-01-01T00:10:00.000Z", "coding", {
    toolName: "Edit",
  });

  const last = lastKnownStateEvent(db, accountId);

  assert.equal(last?.ts, "2026-01-01T00:10:00.000Z");
  assert.equal(last?.stateEnteredAt, "2026-01-01T00:00:00.000Z");
});

test("un cambio de estado corta la racha: stateEnteredAt es el primer evento del estado nuevo", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  insert(db, accountId, "2026-01-01T00:00:00.000Z", "researching", {
    toolName: "Read",
  });
  insert(db, accountId, "2026-01-01T00:10:00.000Z", "coding", {
    toolName: "Edit",
  });
  insert(db, accountId, "2026-01-01T00:12:00.000Z", "coding", {
    toolName: "Edit",
  });

  const last = lastKnownStateEvent(db, accountId);

  assert.equal(last?.derivedState, "coding");
  assert.equal(last?.stateEnteredAt, "2026-01-01T00:10:00.000Z");
});

test("un evento 'unknown' en medio no corta la racha — no cuenta como cambio de estado", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  insert(db, accountId, "2026-01-01T00:00:00.000Z", "coding", {
    toolName: "Edit",
  });
  insert(db, accountId, "2026-01-01T00:05:00.000Z", "unknown", {
    hook: "UserPromptSubmit",
    toolName: null,
  });
  insert(db, accountId, "2026-01-01T00:10:00.000Z", "coding", {
    toolName: "Edit",
  });

  const last = lastKnownStateEvent(db, accountId);

  assert.equal(last?.stateEnteredAt, "2026-01-01T00:00:00.000Z");
});

test("countHookEvents cuenta solo los de la cuenta indicada", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  const otherAccountId = ensureAccount(db, "anthropic", "otra");
  insert(db, accountId, "2026-01-01T00:00:00.000Z", "coding");
  insert(db, accountId, "2026-01-01T00:01:00.000Z", "unknown", {
    hook: "UserPromptSubmit",
    toolName: null,
  });
  insert(db, otherAccountId, "2026-01-01T00:02:00.000Z", "coding");

  assert.equal(countHookEvents(db, accountId), 2);
});

test("eventsBetween devuelve [from, to) de la cuenta, en orden y sin hook ni herramienta", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  const other = ensureAccount(db, "anthropic", "otra");
  insert(db, accountId, "2026-01-01T10:00:00.000Z", "coding");
  insert(db, accountId, "2026-01-01T09:00:00.000Z", "coding");
  insert(db, accountId, "2026-01-01T11:00:00.000Z", "coding");
  insert(db, other, "2026-01-01T10:30:00.000Z", "coding");

  const rows = eventsBetween(
    db,
    accountId,
    new Date("2026-01-01T09:30:00.000Z"),
    new Date("2026-01-01T11:00:00.000Z"),
  );
  assert.deepEqual(
    rows.map((r) => r.ts),
    ["2026-01-01T10:00:00.000Z"],
  );
  assert.deepEqual(Object.keys(rows[0] ?? {}).sort(), [
    "derivedState",
    "project",
    "sessionId",
    "ts",
  ]);
});
