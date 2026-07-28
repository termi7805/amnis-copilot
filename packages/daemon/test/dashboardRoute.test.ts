import assert from "node:assert/strict";
import { test } from "node:test";
import { createDashboardRoute } from "../src/infrastructure/http/routes/dashboard.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";

test("GET /debug sirve la página de depuración con EventSource", async () => {
  const server = createHttpServer({
    routes: { "GET /debug": createDashboardRoute() },
  });
  const port = await server.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/debug`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/html");

    const body = await response.text();
    assert.match(body, /new EventSource\("\/api\/events"\)/);
  } finally {
    await server.close();
  }
});
