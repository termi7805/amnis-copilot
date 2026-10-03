import assert from "node:assert/strict";
import { test } from "node:test";
import type { RebuildEvent } from "@amnis/shared";
import { createIngestRoutes } from "../src/infrastructure/http/routes/ingest.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";
import { rebuildCommand } from "../src/infrastructure/rebuildProcess.ts";

async function withIngest(
  rebuild: () => Promise<void>,
  fn: (ctx: { url: string; events: RebuildEvent[] }) => Promise<void>,
): Promise<void> {
  const events: RebuildEvent[] = [];
  const server = createHttpServer({
    routes: createIngestRoutes({
      rebuild,
      broadcast: (event) => events.push(event),
    }),
  });
  const port = await server.listen(0);
  try {
    await fn({ url: `http://127.0.0.1:${port}/api/ingest/rebuild`, events });
  } finally {
    await server.close();
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("rebuild responde 202 sin esperar y avisa `done` al terminar (#90)", async () => {
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await withIngest(
    () => pending,
    async ({ url, events }) => {
      const res = await fetch(url, { method: "POST" });
      assert.equal(res.status, 202);
      assert.deepEqual(events, []);

      finish();
      await tick();
      assert.deepEqual(events, [{ status: "done" }]);
    },
  );
});

test("rebuild mientras hay otro en curso: 409 y sin lanzar un segundo", async () => {
  let started = 0;
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await withIngest(
    () => {
      started++;
      return pending;
    },
    async ({ url }) => {
      assert.equal((await fetch(url, { method: "POST" })).status, 202);
      assert.equal((await fetch(url, { method: "POST" })).status, 409);
      assert.equal(started, 1);

      finish();
      await tick();
      await tick();
      // Terminada la primera, se puede lanzar otra.
      assert.equal((await fetch(url, { method: "POST" })).status, 202);
    },
  );
});

test("un rebuild que falla avisa `error` con el motivo y libera el cerrojo", async () => {
  let fail = true;
  await withIngest(
    () => (fail ? Promise.reject(new Error("SQLITE_BUSY")) : Promise.resolve()),
    async ({ url, events }) => {
      assert.equal((await fetch(url, { method: "POST" })).status, 202);
      await tick();
      await tick();
      assert.deepEqual(events, [{ status: "error", error: "SQLITE_BUSY" }]);

      fail = false;
      assert.equal((await fetch(url, { method: "POST" })).status, 202);
    },
  );
});

test("rebuildCommand: con node pasa execArgv y script; en SEA solo los argumentos", () => {
  assert.deepEqual(
    rebuildCommand({
      sea: false,
      execPath: "/usr/bin/node",
      execArgv: ["--no-warnings"],
      script: "/repo/packages/daemon/src/cli.ts",
    }),
    {
      command: "/usr/bin/node",
      args: [
        "--no-warnings",
        "/repo/packages/daemon/src/cli.ts",
        "ingest",
        "--rebuild",
      ],
    },
  );
  assert.deepEqual(
    rebuildCommand({
      sea: true,
      execPath: "/opt/amnis/amnis-daemon",
      execArgv: [],
      script: "serve",
    }),
    { command: "/opt/amnis/amnis-daemon", args: ["ingest", "--rebuild"] },
  );
});
