import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AmnisEvent,
  type AmnisSettings,
  type ApiError,
  DEFAULT_SETTINGS,
  formatMessage,
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
    const body = (await res.json()) as ApiError;
    assert.equal(body.field, "screenSeconds");
    assert.match(formatMessage("es", body.error), /screenSeconds/);
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

test("PUT con un petFocus inválido: 400 con el campo, sin guardar ni avisar", async () => {
  await withSettings(async ({ base, state }) => {
    const res = await put(base, JSON.stringify({ petFocus: { kind: "repo" } }));
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { field: string }).field, "petFocus");
    assert.deepEqual(state.saves, []);
    assert.deepEqual(state.events, []);
    assert.deepEqual(state.prefs, DEFAULT_SETTINGS);
  });
});

test("PUT con un petFocus válido: guarda y avisa por SSE", async () => {
  await withSettings(async ({ base, state }) => {
    const petFocus = { kind: "worktree", worktree: "/home/x/repo-1" };
    const res = await put(base, JSON.stringify({ petFocus }));
    assert.equal(res.status, 200);
    const expected = { ...DEFAULT_SETTINGS, petFocus };
    assert.deepEqual(await res.json(), expected);
    assert.deepEqual(state.saves, [expected]);
    assert.deepEqual(state.events, [{ event: "settings", data: expected }]);
  });
});

test("PUT con un theme desconocido: 400 con la lista, sin guardar ni avisar", async () => {
  await withSettings(async ({ base, state }) => {
    const res = await put(base, JSON.stringify({ theme: "sepia" }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as ApiError;
    assert.equal(body.field, "theme");
    assert.match(formatMessage("es", body.error), /catppuccin-mocha/);
    assert.deepEqual(state.saves, []);
    assert.deepEqual(state.events, []);
    assert.deepEqual(state.prefs, DEFAULT_SETTINGS);
  });
});

test("PUT con un theme del catálogo: guarda y avisa por SSE", async () => {
  await withSettings(async ({ base, state }) => {
    const res = await put(base, JSON.stringify({ theme: "tokyo-night" }));
    assert.equal(res.status, 200);
    const expected = { ...DEFAULT_SETTINGS, theme: "tokyo-night" };
    assert.deepEqual(await res.json(), expected);
    assert.deepEqual(state.saves, [expected]);
    assert.deepEqual(state.events, [{ event: "settings", data: expected }]);
  });
});

test("PUT con un locale desconocido: 400 con la lista, sin guardar ni avisar", async () => {
  await withSettings(async ({ base, state }) => {
    const res = await put(base, JSON.stringify({ locale: "fr" }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as ApiError;
    assert.equal(body.field, "locale");
    assert.equal(body.error.key, "settings.invalidLocale");
    assert.match(formatMessage("es", body.error), /system, es, en/);
    assert.deepEqual(state.saves, []);
    assert.deepEqual(state.events, []);
    assert.deepEqual(state.prefs, DEFAULT_SETTINGS);
  });
});

test("PUT con un locale conocido: guarda y avisa por SSE", async () => {
  await withSettings(async ({ base, state }) => {
    const res = await put(base, JSON.stringify({ locale: "en" }));
    assert.equal(res.status, 200);
    const expected = { ...DEFAULT_SETTINGS, locale: "en" };
    assert.deepEqual(await res.json(), expected);
    assert.deepEqual(state.saves, [expected]);
    assert.deepEqual(state.events, [{ event: "settings", data: expected }]);
  });
});

test("PUT con una escala de mascota desconocida: 400 con la lista, sin guardar", async () => {
  await withSettings(async ({ base, state }) => {
    const res = await put(base, JSON.stringify({ petScale: 2 }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as ApiError;
    assert.equal(body.field, "petScale");
    assert.equal(body.error.key, "settings.invalidPetScale");
    assert.match(formatMessage("es", body.error), /0\.75, 1, 1\.3, 1\.6/);
    assert.deepEqual(state.saves, []);
    assert.deepEqual(state.events, []);
  });
});

test("PUT con una escala de mascota conocida: guarda y avisa por SSE", async () => {
  await withSettings(async ({ base, state }) => {
    const res = await put(base, JSON.stringify({ petScale: 1.6 }));
    assert.equal(res.status, 200);
    const expected = { ...DEFAULT_SETTINGS, petScale: 1.6 };
    assert.deepEqual(await res.json(), expected);
    assert.deepEqual(state.saves, [expected]);
    assert.deepEqual(state.events, [{ event: "settings", data: expected }]);
  });
});

test("PUT con un petSkin válido: guarda y avisa por SSE", async () => {
  await withSettings(async ({ base, state }) => {
    const res = await put(base, JSON.stringify({ petSkin: "robi" }));
    assert.equal(res.status, 200);
    const expected = { ...DEFAULT_SETTINGS, petSkin: "robi" };
    assert.deepEqual(state.saves, [expected]);
    assert.deepEqual(state.events, [{ event: "settings", data: expected }]);
  });
});

test("PUT con un petSkin que no es un nombre de carpeta: 400, sin guardar", async () => {
  await withSettings(async ({ base, state }) => {
    const res = await put(base, JSON.stringify({ petSkin: "../x" }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as ApiError;
    assert.equal(body.field, "petSkin");
    assert.equal(body.error.key, "settings.invalidPetSkin");
    assert.deepEqual(state.saves, []);
    assert.deepEqual(state.events, []);
  });
});
