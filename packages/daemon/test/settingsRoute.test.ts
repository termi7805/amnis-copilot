import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AmnisEvent,
  type AmnisSettings,
  DEFAULT_SETTINGS,
} from "@amnis/shared";
import { createEventBroadcaster } from "../src/infrastructure/http/events.ts";
import { createSettingsRoutes } from "../src/infrastructure/http/routes/settings.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";

async function withSettings(
  fn: (ctx: {
    base: string;
    state: {
      prefs: AmnisSettings;
      saves: AmnisSettings[];
      events: AmnisEvent[];
    };
  }) => Promise<void>,
): Promise<void> {
  const state = {
    prefs: { ...DEFAULT_SETTINGS },
    saves: [] as AmnisSettings[],
    events: [] as AmnisEvent[],
  };
  const broadcaster = createEventBroadcaster(60_000);
  const originalBroadcast = broadcaster.broadcast.bind(broadcaster);
  broadcaster.broadcast = (event) => {
    state.events.push(event);
    originalBroadcast(event);
  };
  const server = createHttpServer({
    routes: createSettingsRoutes({
      get: () => state.prefs,
      // Igual que serve.ts: guardar, actualizar y avisar.
      save: (next) => {
        state.saves.push(next);
        state.prefs = next;
        broadcaster.broadcast({ event: "settings", data: next });
      },
    }),
  });
  const port = await server.listen(0);
  try {
    await fn({ base: `http://127.0.0.1:${port}`, state });
  } finally {
    broadcaster.stop();
    await server.close();
  }
}

const put = (base: string, body: string) =>
  fetch(`${base}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  });

test("GET devuelve las preferencias actuales", async () => {
  await withSettings(async ({ base }) => {
    const res = await fetch(`${base}/api/settings`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), DEFAULT_SETTINGS);
  });
});

test("PUT válido cambia, persiste y avisa por SSE; responde con el resultado", async () => {
  await withSettings(async ({ base, state }) => {
    const res = await put(
      base,
      JSON.stringify({ enabled: false, damping: 0.4 }),
    );
    assert.equal(res.status, 200);
    const expected = { ...DEFAULT_SETTINGS, enabled: false, damping: 0.4 };
    assert.deepEqual(await res.json(), expected);
    assert.deepEqual(state.saves, [expected]);
    assert.deepEqual(state.events, [{ event: "settings", data: expected }]);

    const after = await fetch(`${base}/api/settings`);
    assert.deepEqual(await after.json(), expected);
  });
});

test("PUT parcial conserva lo no enviado entre cambios", async () => {
  await withSettings(async ({ base }) => {
    await put(base, JSON.stringify({ enabled: false }));
    const res = await put(base, JSON.stringify({ screenSeconds: 3 }));
    assert.deepEqual(await res.json(), {
      ...DEFAULT_SETTINGS,
      enabled: false,
      screenSeconds: 3,
    });
  });
});

test("PUT inválido: 400 con el campo, y no guarda ni avisa", async () => {
  await withSettings(async ({ base, state }) => {
    const res = await put(
      base,
      JSON.stringify({ enabled: false, screenSeconds: 99 }),
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string; field: string };
    assert.equal(body.field, "screenSeconds");
    assert.match(body.error, /screenSeconds/);
    assert.deepEqual(state.saves, []);
    assert.deepEqual(state.events, []);
    assert.deepEqual(state.prefs, DEFAULT_SETTINGS);
  });
});

test("PUT con un campo desconocido: 400", async () => {
  await withSettings(async ({ base, state }) => {
    const res = await put(base, JSON.stringify({ colour: "teal" }));
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { field: string }).field, "colour");
    assert.deepEqual(state.saves, []);
  });
});

test("PUT con un body que no es JSON: 400", async () => {
  await withSettings(async ({ base, state }) => {
    const res = await put(base, "{ no es json");
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { field: string }).field, "body");
    assert.deepEqual(state.saves, []);
  });
});

test("PUT con un body enorme: 413 sin guardar", async () => {
  await withSettings(async ({ base, state }) => {
    const res = await put(
      base,
      JSON.stringify({ enabled: true, pad: "x".repeat(40_000) }),
    );
    assert.equal(res.status, 413);
    assert.deepEqual(state.saves, []);
  });
});
