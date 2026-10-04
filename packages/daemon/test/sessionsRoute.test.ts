import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionsResponse } from "@amnis/shared";
import { createSessionsRoutes } from "../src/infrastructure/http/routes/sessions.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";
import { ensureAccount } from "../src/infrastructure/persistence/accounts.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import { insertHookEvent } from "../src/infrastructure/persistence/hookEvents.ts";

test("GET /api/sessions: dos worktrees, una viva en cada uno; SessionEnd la apaga", async () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  const ev = (
    sessionId: string,
    worktree: string,
    hook: string,
    state: string,
  ) =>
    insertHookEvent(db, {
      accountId,
      provider: "anthropic",
      ts: new Date().toISOString(),
      hook,
      toolName: null,
      sessionId,
      project: worktree,
      sessionReason: null,
      notificationType: null,
      repoRoot: "/home/x/repo",
      worktree,
      derivedState: state,
    });
  ev("A", "/home/x/repo", "PreToolUse", "coding");
  ev("B", "/home/x/repo-1", "PreToolUse", "researching");

  const server = createHttpServer({
    routes: createSessionsRoutes(db, accountId),
  });
  const port = await server.listen(0);
  const get = async () =>
    (await (
      await fetch(`http://127.0.0.1:${port}/api/sessions`)
    ).json()) as SessionsResponse;
  try {
    const first = await get();
    assert.equal(first.repos.length, 1);
    assert.equal(first.repos[0]?.worktrees.length, 2);
    const alive = (r: SessionsResponse) =>
      Object.fromEntries(
        r.repos[0]?.worktrees.flatMap((w) =>
          w.sessions.map((s) => [s.sessionId, s.alive]),
        ) ?? [],
      );
    assert.deepEqual(alive(first), { A: true, B: true });

    await new Promise((r) => setTimeout(r, 5));
    ev("A", "/home/x/repo", "SessionEnd", "unknown");
    assert.deepEqual(alive(await get()), { A: false, B: true });
  } finally {
    await server.close();
    db.close();
  }
});
