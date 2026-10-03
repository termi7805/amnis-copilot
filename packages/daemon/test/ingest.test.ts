import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ingestAll } from "../src/application/ingestUsage.ts";
import { ensureAccount } from "../src/infrastructure/persistence/accounts.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import { tokensInWindow } from "../src/infrastructure/persistence/usage.ts";
import { createUsageStore } from "../src/infrastructure/persistence/usageStore.ts";
import {
  parseUsageLine,
  readTranscriptChunk,
  statTranscriptSize,
} from "../src/infrastructure/providers/anthropic/transcripts.ts";

const FIXTURE = fileURLToPath(
  new URL("./fixtures/transcript-dupes.jsonl", import.meta.url),
);

test("dedupe por message.id: dos líneas que comparten message.id insertan un único evento", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  const store = createUsageStore(db, accountId);

  const result = ingestAll({
    findTranscripts: () => [FIXTURE],
    statSize: statTranscriptSize,
    readChunk: readTranscriptChunk,
    getOffset: (filePath) => store.getOffset(filePath),
    saveOffset: (filePath, size, offset) =>
      store.saveOffset(filePath, size, offset),
    parseLine: parseUsageLine,
    insertUsageEvent: (event) => store.insertUsageEvent("anthropic", event),
  });

  // 3 líneas, msg_shared_0001 repetido dos veces + msg_unique_0002.
  assert.equal(result.linesRead, 3);
  assert.equal(result.eventsInserted, 2);
  assert.equal(result.duplicatesSkipped, 1);

  const dedupeKeys = db
    .prepare("SELECT dedupe_key FROM usage_events ORDER BY dedupe_key")
    .all() as { dedupe_key: string }[];
  assert.deepEqual(
    dedupeKeys.map((r) => r.dedupe_key),
    ["msg_shared_0001", "msg_unique_0002"],
  );

  // INSERT OR IGNORE se queda con la primera línea de msg_shared_0001
  // (100+0+10+0); deduplicar por uuid en vez de message.id insertaría
  // también la segunda (100+50+10+0) y doblaría el total.
  const total = tokensInWindow(
    db,
    accountId,
    new Date("2026-01-01T00:00:00.000Z"),
  );
  assert.equal(total, 100 + 0 + 10 + 0 + 300 + 150 + 0 + 5);
});

test("parseUsageLine lee gitBranch y trata la rama vacía o ausente como null", () => {
  const line = (extra: string) =>
    `{"type":"assistant","sessionId":"s","timestamp":"2026-01-01T10:00:00.000Z"${extra},"message":{"id":"m","usage":{"input_tokens":1}}}`;
  assert.equal(parseUsageLine(line(',"gitBranch":"main"'))?.gitBranch, "main");
  assert.equal(parseUsageLine(line(',"gitBranch":""'))?.gitBranch, null);
  assert.equal(parseUsageLine(line(""))?.gitBranch, null);
});

test("--rebuild rellena la rama de las filas que no la tenían", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  const store = createUsageStore(db, accountId);
  const base = {
    dedupeKey: "m",
    sessionId: "s",
    project: "/p",
    ts: "2026-01-01T10:00:00.000Z",
    model: null,
    inputTokens: 1,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    serviceTier: null,
  };
  store.insertUsageEvent("anthropic", { ...base, gitBranch: null });
  createUsageStore(db, accountId, { replace: true }).insertUsageEvent(
    "anthropic",
    { ...base, gitBranch: "feat/x" },
  );
  const row = db.prepare("SELECT git_branch FROM usage_events").get() as {
    git_branch: string | null;
  };
  assert.equal(row.git_branch, "feat/x");
});
