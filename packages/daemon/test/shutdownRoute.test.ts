import assert from "node:assert/strict";
import { test } from "node:test";
import { createShutdownRoute } from "../src/infrastructure/http/routes/shutdown.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";

test("POST /api/shutdown avisa a la mascota antes de parar el daemon", async () => {
  const calls: string[] = [];
  const server = createHttpServer({
    routes: {
      "POST /api/shutdown": createShutdownRoute({
        broadcastQuit: () => calls.push("quit"),
        shutdown: () => calls.push("shutdown"),
      }),
    },
  });
  const port = await server.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
      method: "POST",
    });
    assert.equal(res.status, 202);
    // Al revés, el servidor cerraría la SSE antes de escribir el `quit` y
    // la app de escritorio no se enteraría.
    assert.deepEqual(calls, ["quit", "shutdown"]);
  } finally {
    await server.close();
  }
});
