import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { openDb } from "../src/infrastructure/persistence/db.ts";

/** Una BD con el `hook_events` de antes de #106, con eventos ya dentro. */
function legacyDb(path: string): void {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY, provider TEXT NOT NULL, label TEXT NOT NULL,
      plan TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (provider, label)
    );
    INSERT INTO accounts (id, provider, label) VALUES (1, 'anthropic', 'default');
    CREATE TABLE hook_events (
      id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL, provider TEXT NOT NULL,
      ts TEXT NOT NULL, hook TEXT NOT NULL, tool_name TEXT, session_id TEXT,
      project TEXT, derived_state TEXT NOT NULL
    );
  `);
  const insert = db.prepare(
    "INSERT INTO hook_events (account_id, provider, ts, hook, project, derived_state) VALUES (1, 'anthropic', ?, 'Stop', ?, 'resting')",
  );
  insert.run("2026-01-01T00:00:00.000Z", "/r/wt");
  insert.run("2026-01-01T00:01:00.000Z", "/r/wt");
  insert.run("2026-01-01T00:02:00.000Z", "/borrado");
  insert.run("2026-01-01T00:03:00.000Z", null);
  db.close();
}

test("la migración rellena los eventos antiguos una vez por project y solo una vez", () => {
  const dir = mkdtempSync(join(tmpdir(), "amnis-mig-"));
  const path = join(dir, "a.sqlite");
  try {
    legacyDb(path);
    const calls: string[] = [];
    const resolve = (cwd: string) => {
      calls.push(cwd);
      return cwd === "/r/wt"
        ? { repoRoot: "/r", worktree: "/r/wt" }
        : { repoRoot: cwd, worktree: cwd };
    };

    const db = openDb(path, resolve);
    const rows = db
      .prepare(
        "SELECT project, repo_root, worktree FROM hook_events ORDER BY ts",
      )
      .all()
      .map((r) => ({ ...r }));
    assert.deepEqual(calls.sort(), ["/borrado", "/r/wt"]);
    assert.deepEqual(rows, [
      { project: "/r/wt", repo_root: "/r", worktree: "/r/wt" },
      { project: "/r/wt", repo_root: "/r", worktree: "/r/wt" },
      { project: "/borrado", repo_root: "/borrado", worktree: "/borrado" },
      { project: null, repo_root: null, worktree: null },
    ]);

    const indexes = (
      db.prepare("PRAGMA index_list(hook_events)").all() as { name: string }[]
    ).map((i) => i.name);
    for (const name of [
      "idx_hook_repo",
      "idx_hook_worktree",
      "idx_hook_session",
    ]) {
      assert.ok(indexes.includes(name), name);
    }
    db.close();

    openDb(path, () => {
      throw new Error("no debe volver a rellenar");
    }).close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("la migración añade notification_type a una base antigua", () => {
  const dir = mkdtempSync(join(tmpdir(), "amnis-mig-"));
  const path = join(dir, "a.sqlite");
  try {
    legacyDb(path);
    const db = openDb(path, (cwd) => ({ repoRoot: cwd, worktree: cwd }));
    const columns = db.prepare("PRAGMA table_info(hook_events)").all() as {
      name: string;
    }[];
    assert.ok(columns.some((c) => c.name === "notification_type"));
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
