import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createHttpServer,
  type HttpServerDeps,
} from "../src/infrastructure/http/server.ts";

async function withServer(
  deps: HttpServerDeps,
  fn: (
    baseUrl: string,
    server: ReturnType<typeof createHttpServer>,
  ) => Promise<void>,
): Promise<void> {
  const server = createHttpServer(deps);
  const port = await server.listen(0);
  try {
    await fn(`http://127.0.0.1:${port}`, server);
  } finally {
    await server.close();
  }
}

test("una ruta registrada responde tipada bajo /api", async () => {
  await withServer(
    {
      routes: {
        "GET /api/ping": ({ res }) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        },
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ping`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
    },
  );
});

test("ruta desconocida da 404 en JSON", async () => {
  await withServer({ routes: {} }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/no-existe`);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("content-type"), "application/json");
  });
});

test("método incorrecto sobre una ruta conocida da 405", async () => {
  await withServer(
    {
      routes: {
        "GET /api/ping": ({ res }) => {
          res.end("{}");
        },
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ping`, { method: "POST" });
      assert.equal(response.status, 405);
    },
  );
});

test("close() termina las respuestas abiertas y libera el puerto", async () => {
  let releaseResponse: (() => void) | undefined;
  const server = createHttpServer({
    routes: {
      "GET /api/stream": ({ res }) => {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(": open\n\n");
        releaseResponse = () => res.end();
      },
    },
  });

  const port = await server.listen(0);
  const streamPromise = fetch(`http://127.0.0.1:${port}/api/stream`);
  await streamPromise;

  await server.close();
  assert.ok(releaseResponse, "el handler debe haberse ejecutado");

  // El puerto queda libre: volver a escuchar en el mismo puerto no revienta.
  const server2 = createHttpServer({ routes: {} });
  const port2 = await server2.listen(port);
  assert.equal(port2, port);
  await server2.close();
});
