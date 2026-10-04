import assert from "node:assert/strict";
import { test } from "node:test";
import type { PetFocus } from "@amnis/shared";
import { ensureAccount } from "../src/infrastructure/persistence/accounts.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import {
  countHookEvents,
  eventsBetween,
  insertHookEvent,
  lastKnownStateEvent,
  liveSessionCandidates,
  recentSessions,
  sessionStatus,
} from "../src/infrastructure/persistence/hookEvents.ts";

const AUTO: PetFocus = { kind: "auto" };

function insert(
  db: ReturnType<typeof openDb>,
  accountId: number,
  ts: string,
  derivedState: string,
  overrides: {
    hook?: string;
    toolName?: string | null;
    project?: string | null;
    sessionId?: string | null;
    repoRoot?: string | null;
    worktree?: string | null;
  } = {},
): void {
  insertHookEvent(db, {
    accountId,
    provider: "anthropic",
    ts,
    hook: overrides.hook ?? "PreToolUse",
    toolName: overrides.toolName ?? "Edit",
    sessionId: overrides.sessionId ?? null,
    project: overrides.project ?? null,
    sessionReason: null,
    notificationType: null,
    repoRoot: overrides.repoRoot ?? null,
    worktree: overrides.worktree ?? null,
    derivedState,
  });
}

test("lastKnownStateEvent devuelve null sin eventos", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  assert.equal(lastKnownStateEvent(db, accountId, AUTO), null);
});

test("lastKnownStateEvent ignora eventos con derived_state = unknown", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  insert(db, accountId, "2026-01-01T00:00:00.000Z", "coding");
  insert(db, accountId, "2026-01-01T00:01:00.000Z", "unknown", {
    hook: "UserPromptSubmit",
    toolName: null,
  });

  const last = lastKnownStateEvent(db, accountId, AUTO);

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

  const last = lastKnownStateEvent(db, accountId, AUTO);

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

  const last = lastKnownStateEvent(db, accountId, AUTO);

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

  const last = lastKnownStateEvent(db, accountId, AUTO);

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

  const last = lastKnownStateEvent(db, accountId, AUTO);

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

  const last = lastKnownStateEvent(db, accountId, AUTO);

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

test("insertHookEvent guarda session_reason y la migración añade la columna", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  insertHookEvent(db, {
    accountId,
    provider: "anthropic",
    ts: "2026-01-01T00:00:00.000Z",
    hook: "SessionEnd",
    toolName: null,
    sessionId: "s1",
    project: null,
    sessionReason: "clear",
    notificationType: null,
    repoRoot: null,
    worktree: null,
    derivedState: "unknown",
  });

  const row = db
    .prepare("SELECT session_reason, derived_state FROM hook_events")
    .get() as { session_reason: string; derived_state: string };
  assert.deepEqual(
    { ...row },
    { session_reason: "clear", derived_state: "unknown" },
  );
});

test("recentSessions: una fila por sesión con inicio, fin, checkout y último estado", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  const ev = (
    sessionId: string | null,
    ts: string,
    hook: string,
    derivedState: string,
    repoRoot: string | null = "/r",
  ) =>
    insertHookEvent(db, {
      accountId,
      provider: "anthropic",
      ts,
      hook,
      toolName: null,
      sessionId,
      project: repoRoot,
      sessionReason: null,
      notificationType: null,
      repoRoot,
      worktree: repoRoot && `${repoRoot}-1`,
      derivedState,
    });
  // A: empezó antes de la ventana, sigue activa; el último hook no tiene estado.
  ev("A", "2026-01-01T00:00:00.000Z", "SessionStart", "unknown");
  ev("A", "2026-01-10T10:00:00.000Z", "PreToolUse", "coding");
  ev("A", "2026-01-10T10:05:00.000Z", "Notification", "unknown");
  // B: terminada.
  ev("B", "2026-01-10T09:00:00.000Z", "PreToolUse", "testing");
  ev("B", "2026-01-10T09:10:00.000Z", "SessionEnd", "unknown");
  // C: terminada y reanudada con el mismo id.
  ev("C", "2026-01-10T08:00:00.000Z", "SessionEnd", "unknown");
  ev("C", "2026-01-10T08:30:00.000Z", "SessionStart", "unknown");
  // D: fuera de la ventana; E: sin cwd; F: sin sesión.
  ev("D", "2026-01-05T00:00:00.000Z", "PreToolUse", "coding");
  ev("E", "2026-01-10T10:00:00.000Z", "PreToolUse", "coding", null);
  ev(null, "2026-01-10T10:00:00.000Z", "PreToolUse", "coding");

  const rows = recentSessions(
    db,
    accountId,
    new Date("2026-01-09T12:00:00.000Z"),
  );
  const by = Object.fromEntries(rows.map((r) => [r.sessionId, r]));
  assert.deepEqual(Object.keys(by).sort(), ["A", "B", "C"]);
  assert.equal(by.A?.startedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(by.A?.lastEventAt, "2026-01-10T10:05:00.000Z");
  assert.equal(by.A?.lastState, "coding");
  assert.equal(by.A?.ended, false);
  assert.equal(by.A?.repoRoot, "/r");
  assert.equal(by.A?.worktree, "/r-1");
  assert.equal(by.B?.ended, true);
  assert.equal(by.C?.ended, false);
  assert.equal(by.C?.lastState, null);
  db.close();
});

test("lastKnownStateEvent filtra por repo, worktree y sesión; auto mira todo", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  const at = (min: number) => `2026-01-01T00:0${min}:00.000Z`;
  // Dos worktrees del mismo repo y una sesión suelta en otro repo.
  insert(db, accountId, at(0), "coding", {
    sessionId: "a",
    repoRoot: "/r",
    worktree: "/r",
  });
  insert(db, accountId, at(1), "testing", {
    sessionId: "b",
    repoRoot: "/r",
    worktree: "/r-wt",
  });
  insert(db, accountId, at(2), "researching", {
    sessionId: "c",
    repoRoot: "/otro",
    worktree: "/otro",
  });
  const last = (focus: PetFocus) =>
    lastKnownStateEvent(db, accountId, focus)?.derivedState ?? null;

  assert.equal(last(AUTO), "researching");
  assert.equal(last({ kind: "repo", repoRoot: "/r" }), "testing");
  assert.equal(last({ kind: "worktree", worktree: "/r" }), "coding");
  assert.equal(
    last({ kind: "session", sessionId: "b", worktree: "/r-wt" }),
    "testing",
  );
  assert.equal(last({ kind: "worktree", worktree: "/no-existe" }), null);
});

test("la racha (stateEnteredAt) se calcula solo con las filas del foco", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  const o = (worktree: string) => ({ worktree, repoRoot: "/r" });
  insert(db, accountId, "2026-01-01T00:00:00.000Z", "coding", o("/x"));
  insert(db, accountId, "2026-01-01T00:01:00.000Z", "testing", o("/y"));
  insert(db, accountId, "2026-01-01T00:02:00.000Z", "coding", o("/x"));

  const x = lastKnownStateEvent(db, accountId, {
    kind: "worktree",
    worktree: "/x",
  });
  assert.equal(x?.stateEnteredAt, "2026-01-01T00:00:00.000Z");
  assert.equal(
    lastKnownStateEvent(db, accountId, AUTO)?.stateEnteredAt,
    "2026-01-01T00:02:00.000Z",
  );
});

test("sessionStatus: viva, cleared tras un clear, ended tras otro SessionEnd o por inactividad", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  const ev = (
    ts: string,
    sessionId: string,
    hook: string,
    reason: string | null = null,
  ) =>
    insertHookEvent(db, {
      accountId,
      provider: "anthropic",
      ts,
      hook,
      toolName: null,
      sessionId,
      project: null,
      sessionReason: reason,
      notificationType: null,
      repoRoot: null,
      worktree: null,
      derivedState: "unknown",
    });
  const now = new Date("2026-01-01T01:00:00.000Z");
  const recent = "2026-01-01T00:59:00.000Z";
  const old = "2026-01-01T00:00:00.000Z";
  const status = (id: string) => sessionStatus(db, accountId, id, now);

  ev(recent, "viva", "PreToolUse");
  ev(recent, "clear", "SessionEnd", "clear");
  ev(recent, "salida", "SessionEnd", "prompt_input_exit");
  ev(old, "inactiva", "PreToolUse");
  ev(old, "clear-viejo", "SessionEnd", "clear");
  ev("2026-01-01T00:58:00.000Z", "resume", "SessionEnd", "prompt_input_exit");
  ev(recent, "resume", "SessionStart", "resume");

  assert.equal(status("viva"), "alive");
  assert.equal(status("clear"), "cleared");
  assert.equal(status("salida"), "ended");
  assert.equal(status("inactiva"), "ended");
  assert.equal(status("clear-viejo"), "ended");
  assert.equal(status("resume"), "alive");
  assert.equal(status("no-existe"), "ended");
});

test("liveSessionCandidates: una fila por sesión de la ventana, con fin, repo y worktree", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  const ev = (
    sessionId: string | null,
    ts: string,
    hook: string,
    repoRoot: string | null = "/r",
  ) =>
    insert(db, accountId, ts, "unknown", {
      hook,
      sessionId,
      repoRoot,
      worktree: repoRoot && `${repoRoot}-1`,
    });
  // A: viva, con cwd.
  ev("A", "2026-01-10T10:00:00.000Z", "PreToolUse");
  ev("A", "2026-01-10T10:05:00.000Z", "Notification");
  // B: terminada. C: terminada y reanudada (`--resume`) con el mismo id.
  ev("B", "2026-01-10T10:01:00.000Z", "PreToolUse");
  ev("B", "2026-01-10T10:02:00.000Z", "SessionEnd");
  ev("C", "2026-01-10T10:01:00.000Z", "SessionEnd");
  ev("C", "2026-01-10T10:03:00.000Z", "SessionStart");
  // D: antes de la ventana; E: sin cwd (se devuelve, sin repo); F: sin sesión.
  ev("D", "2026-01-10T09:00:00.000Z", "PreToolUse");
  ev("E", "2026-01-10T10:04:00.000Z", "PreToolUse", null);
  ev(null, "2026-01-10T10:04:00.000Z", "PreToolUse");

  const rows = liveSessionCandidates(
    db,
    accountId,
    new Date("2026-01-10T09:55:00.000Z"),
  );
  const by = Object.fromEntries(rows.map((r) => [r.sessionId, r]));
  assert.deepEqual(Object.keys(by).sort(), ["A", "B", "C", "E"]);
  assert.equal(by.A?.lastEventAt, "2026-01-10T10:05:00.000Z");
  assert.equal(by.A?.ended, false);
  assert.equal(by.A?.repoRoot, "/r");
  assert.equal(by.A?.worktree, "/r-1");
  assert.equal(by.B?.ended, true);
  assert.equal(by.C?.ended, false);
  assert.equal(by.E?.repoRoot, null);
  assert.equal(by.E?.worktree, null);
  db.close();
});

test("insertHookEvent guarda notification_type", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  insertHookEvent(db, {
    accountId,
    provider: "anthropic",
    ts: "2026-01-01T00:00:00.000Z",
    hook: "Notification",
    toolName: null,
    sessionId: "s1",
    project: null,
    sessionReason: null,
    notificationType: "idle_prompt",
    repoRoot: null,
    worktree: null,
    derivedState: "unknown",
  });

  const row = db.prepare("SELECT notification_type FROM hook_events").get() as {
    notification_type: string;
  };
  assert.equal(row.notification_type, "idle_prompt");
});

test("el aviso de inactividad tras un Stop no saca a la mascota de resting", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  insert(db, accountId, "2026-01-01T00:00:00.000Z", "coding");
  insert(db, accountId, "2026-01-01T00:01:00.000Z", "resting", {
    hook: "Stop",
  });
  // 60 s después: lo que `recordHook` guarda para un `idle_prompt`.
  insert(db, accountId, "2026-01-01T00:02:00.000Z", "unknown", {
    hook: "Notification",
  });

  assert.equal(
    lastKnownStateEvent(db, accountId, AUTO)?.derivedState,
    "resting",
  );
});
