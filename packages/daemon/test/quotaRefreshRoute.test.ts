import assert from "node:assert/strict";
import { test } from "node:test";
import type { QuotaSnapshot } from "@amnis/shared";
import { createQuotaRefreshRoute } from "../src/infrastructure/http/routes/quotaRefresh.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";

async function withRefreshServer(
  pollNow: () => Promise<QuotaSnapshot>,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createHttpServer({
    routes: { "POST /api/quota/refresh": createQuotaRefreshRoute(pollNow) },
  });
  const port = await server.listen(0);
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await server.close();
  }
}

const SNAPSHOT: QuotaSnapshot = {
  provider: "anthropic",
  authoritative: null,
  local: {
    fiveHourTokens: 0,
    fiveHourUtilization: 0,
    windowStartedAt: null,
    calibrated: true,
    ceilingWindows: 3,
    provisionalUtilization: null,
  },
  divergence: null,
  projection: { fiveHourAtReset: null, fiveHourExhaustsAt: null },
  sampledAt: "2026-01-01T00:00:00.000Z",
  error: null,
  rateLimitedAt: null,
};

async function refresh(
  pollNow: () => Promise<QuotaSnapshot>,
): Promise<{ status: number; body: unknown }> {
  let result = { status: 0, body: undefined as unknown };
  await withRefreshServer(pollNow, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/quota/refresh`, {
      method: "POST",
    });
    result = { status: response.status, body: await response.json() };
  });
  return result;
}

test("POST /api/quota/refresh espera la muestra y responde 200", async () => {
  let calls = 0;
  const { status } = await refresh(() => {
    calls++;
    return Promise.resolve(SNAPSHOT);
  });

  assert.equal(status, 200);
  assert.equal(calls, 1);
});

test("con 429 responde 429 y el aviso para que el botón lo enseñe (#116)", async () => {
  const { status, body } = await refresh(() =>
    Promise.resolve({ ...SNAPSHOT, rateLimitedAt: "2026-01-01T00:00:00.000Z" }),
  );

  assert.equal(status, 429);
  assert.match((body as { error: string }).error, /limitando las consultas/);
});

test("si la muestra falla responde 500 con el error", async () => {
  const { status, body } = await refresh(() =>
    Promise.reject(new Error("fallo simulado")),
  );

  assert.equal(status, 500);
  assert.equal((body as { error: string }).error, "fallo simulado");
});
