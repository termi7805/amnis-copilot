import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const FIXTURE = fileURLToPath(
  new URL("./fixtures/transcript-dupes.jsonl", import.meta.url),
);

/** Copiado, no symlink: findTranscripts lee el fichero real del proyecto. */
function makeFakeClaudeDir(): string {
  const claudeDir = mkdtempSync(join(tmpdir(), "amnis-cli-claude-"));
  const projectDir = join(claudeDir, "projects", "fake-project");
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, "transcript.jsonl"), readFileSync(FIXTURE));
  return claudeDir;
}

function totals(dbPath: string): { events: number; tokens: number } {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS events, COALESCE(SUM(
          input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens
        ), 0) AS tokens FROM usage_events`,
      )
      .get() as { events: number; tokens: number };
    return row;
  } finally {
    db.close();
  }
}

test("amnis ingest incremental vs --rebuild producen los mismos totales", () => {
  const claudeDir = makeFakeClaudeDir();
  const amnisDirIncremental = mkdtempSync(join(tmpdir(), "amnis-cli-incr-"));
  const amnisDirRebuild = mkdtempSync(join(tmpdir(), "amnis-cli-rebuild-"));

  try {
    const env = {
      ...process.env,
      CLAUDE_CONFIG_DIR: claudeDir,
      AMNIS_DIR: amnisDirIncremental,
    };

    // Dos pasadas incrementales: la segunda no debe insertar nada nuevo.
    execFileSync("node", [CLI, "ingest"], { env });
    const secondPass = execFileSync("node", [CLI, "ingest"], {
      env,
      encoding: "utf8",
    });
    assert.match(secondPass, /Eventos insertados:\s+0/);

    execFileSync("node", [CLI, "ingest", "--rebuild"], {
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: claudeDir,
        AMNIS_DIR: amnisDirRebuild,
      },
    });

    const incrementalTotals = totals(join(amnisDirIncremental, "amnis.sqlite"));
    const rebuildTotals = totals(join(amnisDirRebuild, "amnis.sqlite"));

    assert.equal(incrementalTotals.events, 2);
    assert.deepEqual(rebuildTotals, incrementalTotals);
  } finally {
    rmSync(claudeDir, { recursive: true, force: true });
    rmSync(amnisDirIncremental, { recursive: true, force: true });
    rmSync(amnisDirRebuild, { recursive: true, force: true });
  }
});
