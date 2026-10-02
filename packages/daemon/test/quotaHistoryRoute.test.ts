import assert from "node:assert/strict";
import { test } from "node:test";
import type { QuotaHistoryResponse, QuotaPeak } from "@amnis/shared";
import { createQuotaHistoryRoutes } from "../src/infrastructure/http/routes/quotaHistory.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";
import { ensureAccount } from "../src/infrastructure/persistence/accounts.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import { insertQuotaSample } from "../src/infrastructure/persistence/quotaSamples.ts";

async function withRoutes(run: (base: string) => Promise<void>): Promise<void> {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  for (const [ts, five, seven] of [
    ["2026-01-01T10:00:00.000Z", 10, 3],
    ["2026-01-01T13:00:00.000Z", 70, 4],
    ["2026-01-02T01:00:00.000Z", 5, 4],
  ] as const) {
    insertQuotaSample(db, {
      accountId,
      ts,
      fiveHourUtil: five,
      fiveHourResetsAt: null,
      sevenDayUtil: seven,
      sevenDayResetsAt: null,
      limitsJson: null,
      localTokens: 0,
      localUtil: 2,
      source: "both",
      error: null,
    });
  }
  const server = createHttpServer({
    routes: createQuotaHistoryRoutes(db, accountId),
  });
  const port = await server.listen(0);
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await server.close();
    db.close();
  }
}

const RANGE = "from=2026-01-01T00:00:00.000Z&to=2026-01-08T00:00:00.000Z";

test("GET /api/quota/history devuelve la serie con las dos vías", async () => {
  await withRoutes(async (base) => {
    const res = await fetch(`${base}/api/quota/history?${RANGE}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as QuotaHistoryResponse;
    assert.deepEqual(body.samples[0], {
      at: "2026-01-01T10:00:00.000Z",
      fiveHour: 10,
      sevenDay: 3,
      local: 2,
    });
    assert.equal(body.samples.length, 3);
  });
});

test("GET /api/quota/peaks devuelve el pico por día", async () => {
  await withRoutes(async (base) => {
    const res = await fetch(`${base}/api/quota/peaks?${RANGE}`);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()) as QuotaPeak[], [
      { day: "2026-01-01", peak: 70 },
      { day: "2026-01-02", peak: 5 },
    ]);
  });
});

test("fechas inválidas dan 400", async () => {
  await withRoutes(async (base) => {
    for (const path of ["history", "peaks"]) {
      const res = await fetch(`${base}/api/quota/${path}?from=ayer`);
      assert.equal(res.status, 400);
    }
  });
});
