import assert from "node:assert/strict";
import { request } from "node:http";
import { test } from "node:test";
import { msg } from "@amnis/shared";
import { allowedOrigins } from "../src/config.ts";
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

test("un handler que rechaza responde 500 sin tumbar el servidor (#46)", async () => {
  await withServer(
    {
      routes: {
        "GET /api/rota": () => Promise.reject(new Error("boom")),
        "GET /api/ping": ({ res }) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        },
      },
    },
    async (baseUrl) => {
      const broken = await fetch(`${baseUrl}/api/rota`);
      assert.equal(broken.status, 500);
      assert.equal(broken.headers.get("content-type"), "application/json");

      const stillAlive = await fetch(`${baseUrl}/api/ping`);
      assert.equal(stillAlive.status, 200);
    },
  );
});

test("un handler que lanza síncronamente responde 500 sin tumbar el servidor (#48)", async () => {
  await withServer(
    {
      routes: {
        "GET /api/rota": () => {
          throw new Error("boom");
        },
        "GET /api/ping": ({ res }) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        },
      },
    },
    async (baseUrl) => {
      const broken = await fetch(`${baseUrl}/api/rota`);
      assert.equal(broken.status, 500);
      assert.equal(broken.headers.get("content-type"), "application/json");

      const stillAlive = await fetch(`${baseUrl}/api/ping`);
      assert.equal(stillAlive.status, 200);
    },
  );
});

test("con un fallback registrado, /api/desconocida sigue dando 404 JSON (#38)", async () => {
  await withServer(
    {
      routes: {},
      fallback: ({ res }) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html>spa</html>");
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/no-existe`);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("content-type"), "application/json");
    },
  );
});

test("con un fallback registrado, una ruta fuera de /api sí lo usa", async () => {
  await withServer(
    {
      routes: {},
      fallback: ({ res }) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html>spa</html>");
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/pet`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /spa/);
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

// Protección de origen (#88). `fetch` no deja fijar `Host` ni siempre `Origin`,
// así que estos tests hablan HTTP con `node:http`.
async function withWriteServer(
  devOrigin: string | undefined,
  fn: (
    send: (opts: {
      method?: string;
      path?: string;
      headers?: Record<string, string>;
    }) => Promise<{ status: number; body: string }>,
    port: number,
    calls: () => number,
  ) => Promise<void>,
): Promise<void> {
  let calls = 0;
  const server = createHttpServer({
    devOrigin,
    routes: {
      "POST /api/escribe": ({ res }) => {
        calls++;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      },
      "GET /api/lee": ({ res }) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      },
    },
  });
  const port = await server.listen(0);
  const send = (opts: {
    method?: string;
    path?: string;
    headers?: Record<string, string>;
  }) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port,
          method: opts.method ?? "POST",
          path: opts.path ?? "/api/escribe",
          headers: opts.headers,
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
        },
      );
      req.on("error", reject);
      req.end();
    });
  try {
    await fn(send, port, () => calls);
  } finally {
    await server.close();
  }
}

test("un Host ajeno da 403 y no llega al handler (DNS rebinding)", async () => {
  await withWriteServer(undefined, async (send, port, calls) => {
    const response = await send({ headers: { Host: `evil.example:${port}` } });
    assert.equal(response.status, 403);
    assert.equal(JSON.parse(response.body).error.key, "http.hostNotAllowed");
    assert.equal(calls(), 0);
  });
});

test("un Origin ajeno da 403 y no llega al handler", async () => {
  await withWriteServer(undefined, async (send, _port, calls) => {
    const response = await send({
      headers: { Origin: "http://evil.example" },
    });
    assert.equal(response.status, 403);
    assert.equal(
      response.body,
      JSON.stringify({
        error: msg("http.originNotAllowed", { origin: "http://evil.example" }),
      }),
    );
    assert.equal(calls(), 0);
  });
});

test("Origin: null (iframe sandbox, file://) da 403", async () => {
  await withWriteServer(undefined, async (send, _port, calls) => {
    const response = await send({ headers: { Origin: "null" } });
    assert.equal(response.status, 403);
    assert.equal(calls(), 0);
  });
});

test("el mismo daemon en otro puerto es un origen ajeno", async () => {
  await withWriteServer(undefined, async (send, port) => {
    const response = await send({
      headers: { Origin: `http://127.0.0.1:${port + 1}` },
    });
    assert.equal(response.status, 403);
  });
});

test("sin Origin (curl del hook, CLI) pasa", async () => {
  await withWriteServer(undefined, async (send, _port, calls) => {
    const response = await send({});
    assert.equal(response.status, 200);
    assert.equal(calls(), 1);
  });
});

test("el Origin del propio daemon pasa, por IP y por localhost", async () => {
  await withWriteServer(undefined, async (send, port) => {
    for (const origin of [
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
    ]) {
      const response = await send({ headers: { Origin: origin } });
      assert.equal(response.status, 200, origin);
    }
    const viaLocalhost = await send({
      headers: { Host: `localhost:${port}` },
    });
    assert.equal(viaLocalhost.status, 200);
  });
});

test("el origen del dev server solo pasa si se declara", async () => {
  const headers = { Origin: "http://localhost:5173" };
  await withWriteServer("http://localhost:5173", async (send) => {
    assert.equal((await send({ headers })).status, 200);
  });
  await withWriteServer(undefined, async (send) => {
    assert.equal((await send({ headers })).status, 403);
  });
});

test("un POST a una ruta inexistente desde un origen ajeno da 403, no 404", async () => {
  await withWriteServer(undefined, async (send) => {
    const response = await send({
      path: "/api/no-existe",
      headers: { Origin: "http://evil.example" },
    });
    assert.equal(response.status, 403);
  });
});

test("las lecturas (GET) no pasan por la comprobación de origen", async () => {
  await withWriteServer(undefined, async (send) => {
    const response = await send({
      method: "GET",
      path: "/api/lee",
      headers: { Origin: "http://evil.example" },
    });
    assert.equal(response.status, 200);
  });
});

test("una lectura con Host ajeno da 403 (DNS rebinding, #135)", async () => {
  await withWriteServer(undefined, async (send, port) => {
    const response = await send({
      method: "GET",
      path: "/api/lee",
      headers: { Host: `evil.example:${port}` },
    });
    assert.equal(response.status, 403);
    assert.equal(JSON.parse(response.body).error.key, "http.hostNotAllowed");
  });
});

test("una lectura con el Host del daemon pasa, por IP y por localhost", async () => {
  await withWriteServer(undefined, async (send, port) => {
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`]) {
      const response = await send({
        method: "GET",
        path: "/api/lee",
        headers: { Host: host },
      });
      assert.equal(response.status, 200, host);
    }
  });
});

test("allowedOrigins deriva hosts y orígenes del puerto", () => {
  const allowed = allowedOrigins(4747, "http://localhost:5173");
  assert.deepEqual([...allowed.hosts].sort(), [
    "127.0.0.1:4747",
    "localhost:4747",
  ]);
  assert.deepEqual([...allowed.origins].sort(), [
    "http://127.0.0.1:4747",
    "http://localhost:4747",
    "http://localhost:5173",
  ]);
});

test("una ruta con `/*` cubre su prefijo y la exacta gana", async () => {
  const reply =
    (text: string): HttpServerDeps["routes"][string] =>
    ({ res }) => {
      res.writeHead(200);
      res.end(text);
    };
  await withServer(
    {
      routes: {
        "GET /api/cosas/*": reply("prefijo"),
        "GET /api/cosas/fija": reply("exacta"),
      },
    },
    async (baseUrl) => {
      const text = async (path: string) => (await fetch(baseUrl + path)).text();
      assert.equal(await text("/api/cosas/a/b"), "prefijo");
      assert.equal(await text("/api/cosas/fija"), "exacta");
      assert.equal((await fetch(`${baseUrl}/api/otra`)).status, 404);
      const post = await fetch(`${baseUrl}/api/cosas/a`, { method: "POST" });
      assert.equal(post.status, 405);
    },
  );
});
