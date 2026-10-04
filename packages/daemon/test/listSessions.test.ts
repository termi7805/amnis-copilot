import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ListSessionsDeps,
  listSessions,
} from "../src/application/listSessions.ts";

const NOW = new Date("2026-01-10T12:00:00.000Z");
const ago = (min: number) =>
  new Date(NOW.getTime() - min * 60_000).toISOString();

type Row = ReturnType<ListSessionsDeps["recentSessions"]>[number];

function row(over: Partial<Row> & { sessionId: string }): Row {
  return {
    startedAt: ago(120),
    lastEventAt: ago(1),
    ended: false,
    repoRoot: "/home/x/repo",
    worktree: "/home/x/repo",
    lastState: "coding",
    ...over,
  };
}

const run = (rows: Row[], branches: Record<string, string> = {}) =>
  listSessions(
    {
      recentSessions: () => rows,
      branchBySession: () => new Map(Object.entries(branches)),
    },
    NOW,
  );

test("dos worktrees del mismo repo: un repo, dos worktrees, una viva en cada uno", () => {
  const { repos } = run([
    row({ sessionId: "a", worktree: "/home/x/repo" }),
    row({ sessionId: "b", worktree: "/home/x/repo-1" }),
  ]);
  assert.equal(repos.length, 1);
  assert.equal(repos[0]?.name, "repo");
  assert.equal(repos[0]?.worktrees.length, 2);
  for (const w of repos[0]?.worktrees ?? []) {
    assert.equal(w.sessions.length, 1);
    assert.equal(w.sessions[0]?.alive, true);
  }
});

test("viva: estado del último hook; recién abierta sin estado, resting", () => {
  const { repos } = run([
    row({ sessionId: "a", lastState: "testing" }),
    row({ sessionId: "b", lastState: null, worktree: "/home/x/other" }),
  ]);
  const states = repos[0]?.worktrees.flatMap((w) =>
    w.sessions.map((s) => [s.sessionId, s.state]),
  );
  assert.deepEqual(states?.sort(), [
    ["a", "testing"],
    ["b", "resting"],
  ]);
});

test("sin SessionEnd pero inactiva más de 10 min: no viva y sleeping", () => {
  const s = run([row({ sessionId: "a", lastEventAt: ago(30) })]).repos[0]
    ?.worktrees[0]?.sessions[0];
  assert.equal(s?.alive, false);
  assert.equal(s?.state, "sleeping");
});

test("con SessionEnd no está viva aunque el último hook sea reciente", () => {
  const s = run([row({ sessionId: "a", ended: true })]).repos[0]?.worktrees[0]
    ?.sessions[0];
  assert.equal(s?.alive, false);
  assert.equal(s?.state, "sleeping");
});

test("la rama sale de las sesiones del worktree; sin rama, null", () => {
  const { repos } = run(
    [
      row({ sessionId: "a" }),
      row({ sessionId: "b", worktree: "/home/x/repo-1" }),
    ],
    { b: "108-foco" },
  );
  const branch = (name: string) =>
    repos[0]?.worktrees.find((w) => w.name === name)?.branch;
  assert.equal(branch("repo"), null);
  assert.equal(branch("repo-1"), "108-foco");
});

test("orden: lo más reciente primero, en repos, worktrees y sesiones", () => {
  const { repos } = run([
    row({
      sessionId: "old",
      repoRoot: "/r/a",
      worktree: "/r/a",
      lastEventAt: ago(60),
    }),
    row({
      sessionId: "new",
      repoRoot: "/r/b",
      worktree: "/r/b",
      lastEventAt: ago(1),
    }),
    row({
      sessionId: "s1",
      repoRoot: "/r/b",
      worktree: "/r/b",
      lastEventAt: ago(5),
    }),
    row({
      sessionId: "w2",
      repoRoot: "/r/b",
      worktree: "/r/b-2",
      lastEventAt: ago(3),
    }),
  ]);
  assert.deepEqual(
    repos.map((r) => r.name),
    ["b", "a"],
  );
  assert.deepEqual(
    repos[0]?.worktrees.map((w) => w.name),
    ["b", "b-2"],
  );
  assert.deepEqual(
    repos[0]?.worktrees[0]?.sessions.map((s) => s.sessionId),
    ["new", "s1"],
  );
});

test("sin sesiones: lista vacía", () => {
  assert.deepEqual(run([]), { repos: [] });
});
