import assert from "node:assert/strict";
import { test } from "node:test";
import { createQuotaRefreshRoute } from "../src/infrastructure/http/routes/quotaRefresh.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";

async function withRefreshServer(
  pollNow: () => void,
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

test("POST /api/quota/refresh responde 200 y dispara pollNow", async () => {
  let calls = 0;
  await withRefreshServer(
    () => {
      calls++;
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/quota/refresh`, {
        method: "POST",
      });

      assert.equal(response.status, 200);
      assert.equal(calls, 1);
    },
  );
});
