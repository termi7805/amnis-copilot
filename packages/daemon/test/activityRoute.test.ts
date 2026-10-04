import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActivityHeatmapResponse, ActivityResponse } from "@amnis/shared";
import { createActivityRoutes } from "../src/infrastructure/http/routes/activity.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";
import { ensureAccount } from "../src/infrastructure/persistence/accounts.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import { insertHookEvent } from "../src/infrastructure/persistence/hookEvents.ts";
import { insertUsageEvent } from "../src/infrastructure/persistence/usageEvents.ts";

process.env.TZ = "Europe/Madrid";

const local = (d: number, h: number, m = 0) =>
  new Date(2026, 0, d, h, m).toISOString();

async function withRoutes(
  seed: (db: ReturnType<typeof openDb>, accountId: number) => void,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  seed(db, accountId);
  const server = createHttpServer({
    routes: createActivityRoutes(db, accountId),
  });
  const port = await server.listen(0);
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await server.close();
    db.close();
  }
}

function hook(
  db: ReturnType<typeof openDb>,
  accountId: number,
  sessionId: string,
  project: string,
  ts: string,
  derivedState: string,
): void {
  insertHookEvent(db, {
    accountId,
    provider: "anthropic",
    ts,
    hook: "PreToolUse",
    toolName: null,
    sessionId,
    project,
    sessionReason: null,
    repoRoot: null,
    worktree: null,
    derivedState,
  });
}

test("GET /api/activity: sesiones solapadas con proyecto, espera, coste y rama", async () => {
  await withRoutes(
    (db, accountId) => {
      // Lunes 12 de enero de 2026, hora local. A y B se solapan.
      hook(db, accountId, "a", "/home/x/amnis", local(12, 10, 0), "coding");
      hook(db, accountId, "b", "/home/x/otro", local(12, 10, 2), "researching");
      hook(db, accountId, "a", "/home/x/amnis", local(12, 10, 5), "waiting");
      hook(db, accountId, "a", "/home/x/amnis", local(12, 10, 9), "terminal");
      hook(db, accountId, "b", "/home/x/otro", local(12, 10, 12), "resting");
      insertUsageEvent(db, {
        accountId,
        provider: "anthropic",
        dedupeKey: "m1",
        sessionId: "a",
        project: "/home/x/amnis",
        gitBranch: "main",
        ts: local(12, 10, 1),
        model: "claude-sonnet-5",
        inputTokens: 1_000,
        outputTokens: 500,
        cacheCreationTokens: 0,
        cacheCreation1hTokens: 0,
        cacheReadTokens: 0,
        serviceTier: null,
      });
    },
    async (base) => {
      const res = await fetch(`${base}/api/activity?day=2026-01-12`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as ActivityResponse;

      assert.equal(body.day, "2026-01-12");
      assert.deepEqual(
        body.sessions.map((s) => [s.sessionId, s.project]),
        [
          ["a", "amnis"],
          ["b", "otro"],
        ],
      );
      const a = body.sessions[0];
      assert.equal(a?.gitBranch, "main");
      assert.equal(a?.tokens, 1_500);
      assert.ok((a?.costUsd ?? 0) > 0);
      assert.equal(body.sessions[1]?.gitBranch, null);
      assert.equal(body.sessions[1]?.tokens, 0);

      // a esperó de 10:05 a 10:09.
      assert.deepEqual(body.waiting, { minutes: 4, count: 1 });

      const duration = (s: { start: string; end: string }) =>
        (Date.parse(s.end) - Date.parse(s.start)) / 60_000;
      const total = Object.values(body.byState).reduce((x, y) => x + y, 0);
      assert.equal(
        total,
        body.segments.reduce((acc, s) => acc + duration(s), 0),
      );
      assert.ok(body.segments.every((s) => s.group));
    },
  );
});

test("GET /api/activity: un día sin eventos responde vacío", async () => {
  await withRoutes(
    () => {},
    async (base) => {
      const body = (await (
        await fetch(`${base}/api/activity?day=2026-01-12`)
      ).json()) as ActivityResponse;
      assert.deepEqual(body.sessions, []);
      assert.deepEqual(body.byState, {});
      assert.deepEqual(body.waiting, { minutes: 0, count: 0 });
    },
  );
});

test("GET /api/activity rechaza un day que no es una fecha real", async () => {
  await withRoutes(
    () => {},
    async (base) => {
      for (const day of ["ayer", "2026-02-30", "2026-1-5"]) {
        const res = await fetch(`${base}/api/activity?day=${day}`);
        assert.equal(res.status, 400, day);
      }
    },
  );
});

test("GET /api/activity/heatmap devuelve 7×24 con la actividad reciente", async () => {
  await withRoutes(
    (db, accountId) => {
      const ago = (min: number) =>
        new Date(Date.now() - min * 60_000).toISOString();
      hook(db, accountId, "a", "/x/p", ago(20), "coding");
      hook(db, accountId, "a", "/x/p", ago(10), "testing");
    },
    async (base) => {
      const body = (await (
        await fetch(`${base}/api/activity/heatmap?weeks=4`)
      ).json()) as ActivityHeatmapResponse;
      assert.equal(body.weeks, 4);
      assert.equal(body.minutes.length, 7);
      assert.ok(body.minutes.every((row) => row.length === 24));
      const total = body.minutes.flat().reduce((x, y) => x + y, 0);
      // coding 10 min + testing hasta el tope o `now` (≥ 10 min).
      assert.ok(total >= 19 && total <= 30, `total=${total}`);
    },
  );
});

test("GET /api/activity/heatmap valida weeks", async () => {
  await withRoutes(
    () => {},
    async (base) => {
      for (const weeks of ["0", "53", "x", "1.5"]) {
        const res = await fetch(`${base}/api/activity/heatmap?weeks=${weeks}`);
        assert.equal(res.status, 400, weeks);
      }
    },
  );
});
