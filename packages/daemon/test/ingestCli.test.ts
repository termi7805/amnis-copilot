import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
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
import { runIngest } from "../src/application/ingestUsage.ts";
import type { Provider, UsageStore } from "../src/domain/Provider.ts";

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

function assistantLine(id: string, inputTokens: number): string {
  return JSON.stringify({
    type: "assistant",
    sessionId: "sess-1",
    cwd: "/fake/project",
    timestamp: "2026-10-01T10:00:00.000Z",
    message: {
      id,
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: inputTokens, output_tokens: 0 },
    },
  });
}

test("amnis ingest lee los transcripts de subagentes y workflows sin contar dos veces", () => {
  const claudeDir = mkdtempSync(join(tmpdir(), "amnis-cli-claude-"));
  const amnisDir = mkdtempSync(join(tmpdir(), "amnis-cli-sub-"));
  const projectDir = join(claudeDir, "projects", "fake-project");
  const subagentsDir = join(projectDir, "sess-1", "subagents");
  const workflowDir = join(subagentsDir, "workflows", "wf_1");
  mkdirSync(workflowDir, { recursive: true });

  writeFileSync(
    join(projectDir, "sess-1.jsonl"),
    `${assistantLine("msg_parent", 100)}\n${assistantLine("msg_shared", 10)}\n`,
  );
  // msg_shared también en el subagente: el UNIQUE(dedupe_key) lo absorbe.
  writeFileSync(
    join(subagentsDir, "agent-a.jsonl"),
    `${assistantLine("msg_shared", 10)}\n${assistantLine("msg_sub", 1000)}\n`,
  );
  writeFileSync(
    join(workflowDir, "agent-b.jsonl"),
    `${assistantLine("msg_wf", 10000)}\n`,
  );
  // No es un transcript: no se ingiere aunque tenga forma de línea de uso.
  writeFileSync(
    join(subagentsDir, "workflows", "wf_1.json"),
    assistantLine("msg_not_transcript", 100000),
  );

  try {
    const env = {
      ...process.env,
      CLAUDE_CONFIG_DIR: claudeDir,
      AMNIS_DIR: amnisDir,
    };
    execFileSync("node", [CLI, "ingest"], { env });
    const secondPass = execFileSync("node", [CLI, "ingest"], {
      env,
      encoding: "utf8",
    });
    assert.match(secondPass, /Eventos insertados:\s+0/);

    assert.deepEqual(
      { ...totals(join(amnisDir, "amnis.sqlite")) },
      {
        events: 4,
        tokens: 100 + 10 + 1000 + 10000,
      },
    );
  } finally {
    rmSync(claudeDir, { recursive: true, force: true });
    rmSync(amnisDir, { recursive: true, force: true });
  }
});

function count(db: DatabaseSync, table: string): number {
  return (
    db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
  ).n;
}

test("--rebuild no borra nada: conserva cuota, hooks, techo y el uso de transcripts purgados, y corrige lo que cambió", () => {
  const claudeDir = makeFakeClaudeDir();
  const amnisDir = mkdtempSync(join(tmpdir(), "amnis-cli-keep-"));
  const dbPath = join(amnisDir, "amnis.sqlite");
  const env = {
    ...process.env,
    CLAUDE_CONFIG_DIR: claudeDir,
    AMNIS_DIR: amnisDir,
  };

  try {
    execFileSync("node", [CLI, "ingest"], { env });
    const before = totals(dbPath);

    const db = new DatabaseSync(dbPath);
    db.exec(`
      UPDATE accounts SET plan_window_tokens = 123456;
      INSERT INTO quota_samples (account_id, ts, five_hour_util, local_tokens, local_util, source)
        VALUES (1, '2026-01-01T10:00:00.000Z', 42, 10, 5, 'both'),
               (1, '2026-01-01T10:03:00.000Z', 43, 11, 5, 'both');
      INSERT INTO hook_events (account_id, provider, ts, hook, derived_state)
        VALUES (1, 'anthropic', '2026-01-01T10:00:00.000Z', 'PreToolUse', 'coding');
      -- Uso de un transcript que Claude Code ya purgó: no está en ningún JSONL.
      INSERT INTO usage_events (account_id, provider, dedupe_key, ts, input_tokens)
        VALUES (1, 'anthropic', 'purgado', '2026-06-01T09:00:00.000Z', 999);
      -- Una fila mal parseada antes: la reingesta debe corregirla.
      UPDATE usage_events SET input_tokens = 7777
        WHERE dedupe_key = (SELECT dedupe_key FROM usage_events WHERE dedupe_key != 'purgado' LIMIT 1);
    `);
    db.close();

    const out = execFileSync("node", [CLI, "ingest", "--rebuild"], {
      env,
      encoding: "utf8",
    });
    // Las filas que ya existían no cuentan como insertadas.
    assert.match(out, /Eventos insertados:\s+0/);

    const after = new DatabaseSync(dbPath);
    try {
      assert.equal(count(after, "quota_samples"), 2);
      assert.equal(count(after, "hook_events"), 1);
      assert.equal(
        (
          after
            .prepare("SELECT plan_window_tokens AS t FROM accounts")
            .get() as {
            t: number;
          }
        ).t,
        123456,
      );
      // Lo purgado se conserva...
      assert.equal(
        (
          after
            .prepare(
              "SELECT input_tokens AS t FROM usage_events WHERE dedupe_key = 'purgado'",
            )
            .get() as { t: number }
        ).t,
        999,
      );
    } finally {
      after.close();
    }
    // ...y lo corregible se corrige: mismos totales que antes, más el purgado.
    const final = totals(dbPath);
    assert.equal(final.events, before.events + 1);
    assert.equal(final.tokens, before.tokens + 999);
  } finally {
    rmSync(claudeDir, { recursive: true, force: true });
    rmSync(amnisDir, { recursive: true, force: true });
  }
});

test("runIngest --rebuild es atómico: si la reingesta falla, los offsets no se pierden", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE ingest_offsets (f TEXT); INSERT INTO ingest_offsets VALUES ('a');",
  );
  const failing = {
    id: "anthropic",
    ingestHistorical: () => {
      throw new Error("fallo a mitad");
    },
  } as unknown as Provider;

  const deps = {
    providers: [failing],
    openStore: () => ({
      store: {} as never,
      resetOffsets: () => db.exec("DELETE FROM ingest_offsets"),
      transaction: <T>(fn: () => T): T => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = fn();
          db.exec("COMMIT");
          return result;
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }
      },
      close: () => {},
    }),
  };

  assert.throws(() => runIngest(deps, { rebuild: true }), /fallo a mitad/);
  assert.equal(count(db, "ingest_offsets"), 1);
  db.close();
});

/** Provider que lee dos eventos de un fichero y los entrega al store. */
function readingProvider(): Provider {
  return {
    id: "anthropic",
    ingestHistorical: (store: UsageStore) => {
      assert.equal(store.getOffset("/x.jsonl"), undefined);
      const event = {
        dedupeKey: "k",
        sessionId: null,
        project: null,
        gitBranch: null,
        ts: "2026-01-01T00:00:00Z",
        model: null,
        inputTokens: 1,
        outputTokens: 1,
        cacheCreationTokens: 0,
        cacheCreation1hTokens: 0,
        cacheReadTokens: 0,
        serviceTier: null,
      };
      store.insertUsageEvent("anthropic", event);
      store.insertUsageEvent("anthropic", { ...event, dedupeKey: "j" });
      store.saveOffset("/x.jsonl", 10, 10);
      return {
        filesScanned: 1,
        linesRead: 2,
        eventsInserted: 2,
        duplicatesSkipped: 0,
      };
    },
  } as unknown as Provider;
}

test("runIngest --rebuild lee fuera de la transacción y escribe dentro (#90)", () => {
  const log: string[] = [];
  const store = {
    getOffset: () => {
      throw new Error("el store real no se lee en rebuild");
    },
    saveOffset: () => log.push("saveOffset"),
    insertUsageEvent: (_p: string, e: { dedupeKey: string }) => {
      log.push(`insert:${e.dedupeKey}`);
      // El segundo es un duplicado según la BD real.
      return e.dedupeKey === "k";
    },
  };
  const deps = {
    providers: [
      {
        ...readingProvider(),
        ingestHistorical: (s: UsageStore) => {
          log.push("read");
          return readingProvider().ingestHistorical(s);
        },
      } as Provider,
    ],
    openStore: () => ({
      store: store as never,
      resetOffsets: () => log.push("resetOffsets"),
      transaction: <T>(fn: () => T): T => {
        log.push("begin");
        const result = fn();
        log.push("commit");
        return result;
      },
      close: () => {},
    }),
  };

  const result = runIngest(deps, { rebuild: true });

  assert.deepEqual(log, [
    "read",
    "begin",
    "resetOffsets",
    "insert:k",
    "insert:j",
    "saveOffset",
    "commit",
  ]);
  // Lectura de la primera fase, inserciones de la segunda.
  assert.deepEqual(result, {
    filesScanned: 1,
    linesRead: 2,
    eventsInserted: 1,
    duplicatesSkipped: 1,
  });
});

test("runIngest --rebuild: si falla la escritura, se deshace todo", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE ingest_offsets (f TEXT); INSERT INTO ingest_offsets VALUES ('a');",
  );
  const deps = {
    providers: [readingProvider()],
    openStore: () => ({
      store: {
        saveOffset: () => {},
        insertUsageEvent: () => {
          throw new Error("disco lleno");
        },
      } as never,
      resetOffsets: () => db.exec("DELETE FROM ingest_offsets"),
      transaction: <T>(fn: () => T): T => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = fn();
          db.exec("COMMIT");
          return result;
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }
      },
      close: () => {},
    }),
  };

  assert.throws(() => runIngest(deps, { rebuild: true }), /disco lleno/);
  assert.equal(count(db, "ingest_offsets"), 1);
  db.close();
});

test("runIngest incremental (#98): lee con los offsets reales fuera de la transacción y escribe dentro, sin resetear offsets", () => {
  const log: string[] = [];
  const provider = {
    id: "anthropic",
    ingestHistorical: (store: UsageStore) => {
      log.push("read");
      assert.deepEqual(store.getOffset("/x.jsonl"), { size: 5, offset: 5 });
      store.insertUsageEvent("anthropic", {
        dedupeKey: "k",
        sessionId: null,
        project: null,
        gitBranch: null,
        ts: "2026-01-01T00:00:00Z",
        model: null,
        inputTokens: 1,
        outputTokens: 1,
        cacheCreationTokens: 0,
        cacheCreation1hTokens: 0,
        cacheReadTokens: 0,
        serviceTier: null,
      });
      store.saveOffset("/x.jsonl", 10, 10);
      return {
        filesScanned: 1,
        linesRead: 1,
        eventsInserted: 1,
        duplicatesSkipped: 0,
      };
    },
  } as unknown as Provider;

  const result = runIngest(
    {
      providers: [provider],
      openStore: () => ({
        store: {
          getOffset: () => ({ size: 5, offset: 5 }),
          saveOffset: () => log.push("saveOffset"),
          insertUsageEvent: () => {
            log.push("insert");
            return true;
          },
        },
        resetOffsets: () => log.push("resetOffsets"),
        transaction: <T>(fn: () => T): T => {
          log.push("begin");
          const out = fn();
          log.push("commit");
          return out;
        },
        close: () => {},
      }),
    },
    { rebuild: false },
  );

  assert.deepEqual(log, ["read", "begin", "insert", "saveOffset", "commit"]);
  assert.equal(result.eventsInserted, 1);
});

test("runIngest incremental: si falla la escritura, no se guarda ningún offset", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE ingest_offsets (f TEXT)");
  const deps = {
    providers: [
      {
        id: "anthropic",
        ingestHistorical: (store: UsageStore) => {
          store.saveOffset("/x.jsonl", 10, 10);
          return {
            filesScanned: 1,
            linesRead: 0,
            eventsInserted: 0,
            duplicatesSkipped: 0,
          };
        },
      } as unknown as Provider,
    ],
    openStore: () => ({
      store: {
        getOffset: () => undefined,
        saveOffset: () => {
          db.exec("INSERT INTO ingest_offsets VALUES ('/x.jsonl')");
          throw new Error("database is locked");
        },
        insertUsageEvent: () => true,
      } as never,
      resetOffsets: () => {},
      transaction: <T>(fn: () => T): T => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = fn();
          db.exec("COMMIT");
          return result;
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }
      },
      close: () => {},
    }),
  };

  assert.throws(
    () => runIngest(deps, { rebuild: false }),
    /database is locked/,
  );
  assert.equal(count(db, "ingest_offsets"), 0);
  db.close();
});

test("dos amnis ingest a la vez (el daemon y uno a mano) no duplican nada", async () => {
  const claudeDir = makeFakeClaudeDir();
  const amnisDir = mkdtempSync(join(tmpdir(), "amnis-cli-concurrent-"));
  const env = {
    ...process.env,
    CLAUDE_CONFIG_DIR: claudeDir,
    AMNIS_DIR: amnisDir,
  };
  const run = () =>
    new Promise<void>((resolve, reject) => {
      execFile("node", [CLI, "ingest"], { env }, (err) =>
        err ? reject(err) : resolve(),
      );
    });

  try {
    // La primera vez también crea la BD: se hace antes para no competir por ella.
    execFileSync("node", [CLI, "ingest"], { env });
    const before = totals(join(amnisDir, "amnis.sqlite"));
    writeFileSync(
      join(claudeDir, "projects", "fake-project", "nuevo.jsonl"),
      `${assistantLine("msg_a", 5)}\n${assistantLine("msg_b", 7)}\n`,
    );
    await Promise.all([run(), run(), run()]);

    const after = totals(join(amnisDir, "amnis.sqlite"));
    assert.equal(after.events, before.events + 2);
    assert.equal(after.tokens, before.tokens + 5 + 7);
    const third = execFileSync("node", [CLI, "ingest"], {
      env,
      encoding: "utf8",
    });
    assert.match(third, /Eventos insertados:\s+0/);
  } finally {
    rmSync(claudeDir, { recursive: true, force: true });
    rmSync(amnisDir, { recursive: true, force: true });
  }
});
