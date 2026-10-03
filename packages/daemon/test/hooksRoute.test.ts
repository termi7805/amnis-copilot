import assert from "node:assert/strict";
import { test } from "node:test";
import type { RepairHooksResponse } from "@amnis/shared";
import { createHooksRoutes } from "../src/infrastructure/http/routes/hooks.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";

test("POST /api/hooks/install devuelve lo que repara y no acepta GET (#90)", async () => {
  let calls = 0;
  const server = createHttpServer({
    routes: createHooksRoutes(() => {
      calls++;
      return { added: ["Notification"], backup: "/x/backup.json" };
    }),
  });
  const port = await server.listen(0);
  try {
    const url = `http://127.0.0.1:${port}/api/hooks/install`;

    assert.equal((await fetch(url)).status, 405);
    assert.equal(calls, 0);

    const res = await fetch(url, { method: "POST" });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()) as RepairHooksResponse, {
      added: ["Notification"],
      backup: "/x/backup.json",
    });
    assert.equal(calls, 1);
  } finally {
    await server.close();
  }
});
