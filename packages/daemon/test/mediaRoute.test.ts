import assert from "node:assert/strict";
import { test } from "node:test";
import { createMediaRoutes } from "../src/infrastructure/http/routes/media.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";
import type {
  ControlFailure,
  ControlResult,
  DevicesResult,
  MediaControl,
} from "../src/infrastructure/providers/spotify/control.ts";

type Action = [string, string, unknown?];

/** Las 8 órdenes con un body válido, más la lectura de dispositivos. */
const ROUTES: Action[] = [
  ["POST", "play"],
  ["POST", "pause"],
  ["POST", "next"],
  ["POST", "previous"],
  ["POST", "seek", { positionMs: 1000 }],
  ["POST", "shuffle", { state: true }],
  ["POST", "repeat", { mode: "track" }],
  ["POST", "transfer", { deviceId: "d1" }],
  ["GET", "devices"],
];

function controlReturning(
  result: ControlResult & DevicesResult,
  calls: string[] = [],
): MediaControl {
  const make = (name: string) => async () => {
    calls.push(name);
    return result;
  };
  return {
    play: make("play"),
    pause: make("pause"),
    next: make("next"),
    previous: make("previous"),
    seek: make("seek"),
    setShuffle: make("shuffle"),
    setRepeat: make("repeat"),
    transfer: make("transfer"),
    devices: make("devices"),
  };
}

async function withMedia(
  control: MediaControl,
  fn: (ctx: {
    base: string;
    after: { count: number; refreshes: number };
    hit: (a: Action) => Promise<Response>;
  }) => Promise<void>,
): Promise<void> {
  const after = { count: 0, refreshes: 0 };
  const server = createHttpServer({
    routes: createMediaRoutes({
      control,
      afterAction: () => {
        after.count++;
      },
      refresh: () => {
        after.refreshes++;
      },
    }),
  });
  const port = await server.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const hit = ([method, name, body]: Action) =>
    fetch(`${base}/api/media/${name}`, {
      method,
      ...(body !== undefined && {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
  try {
    await fn({ base, after, hit });
  } finally {
    await server.close();
  }
}

function failure(
  kind: ControlFailure["kind"],
  extra: Partial<ControlFailure> = {},
): ControlResult & DevicesResult {
  return { ok: false, kind, message: `msg ${kind}`, ...extra };
}

test("con Spotify cerrado en todos los dispositivos, TODA ruta responde 409, nunca 500", async () => {
  await withMedia(
    controlReturning(failure("no-device")),
    async ({ hit, after }) => {
      for (const action of ROUTES) {
        const res = await hit(action);
        assert.equal(res.status, 409, `${action[0]} ${action[1]}`);
        const body = (await res.json()) as { kind: string; error: string };
        assert.equal(body.kind, "no-device");
      }
      assert.equal(after.count, 0);
    },
  );
});

test("cada tipo de fallo se traduce a su código HTTP", async () => {
  const expected: [ControlFailure["kind"], number][] = [
    ["forbidden", 403],
    ["rate-limited", 429],
    ["not-logged-in", 401],
    ["unavailable", 502],
  ];
  for (const [kind, status] of expected) {
    await withMedia(
      controlReturning(
        failure(kind, kind === "rate-limited" ? { retryAfterMs: 7000 } : {}),
      ),
      async ({ hit }) => {
        const res = await hit(["POST", "pause"]);
        assert.equal(res.status, status, kind);
        if (kind === "rate-limited")
          assert.equal(res.headers.get("Retry-After"), "7");
        if (kind === "not-logged-in") {
          const body = (await res.json()) as { remedy?: string };
          assert.match(body.remedy ?? "", /amnis spotify login/);
        }
      },
    );
  }
});

test("un throw inesperado del provider es 502, no 500", async () => {
  const control = controlReturning({ ok: true, devices: [] });
  control.pause = async () => {
    throw new Error("boom");
  };
  await withMedia(control, async ({ hit }) => {
    const res = await hit(["POST", "pause"]);
    assert.equal(res.status, 502);
  });
});

test("body inválido: 400 y no se llama a Spotify", async () => {
  const calls: string[] = [];
  await withMedia(
    controlReturning({ ok: true, devices: [] }, calls),
    async ({ base, hit, after }) => {
      const invalid: Action[] = [
        ["POST", "seek", { positionMs: -1 }],
        ["POST", "seek", { positionMs: 1.5 }],
        ["POST", "seek", { positionMs: "1000" }],
        ["POST", "shuffle", { state: "yes" }],
        ["POST", "repeat", { mode: "raro" }],
        ["POST", "transfer", { deviceId: "" }],
        ["POST", "transfer", {}],
        ["POST", "seek", null],
      ];
      for (const action of invalid) {
        assert.equal((await hit(action)).status, 400, JSON.stringify(action));
      }
      const broken = await fetch(`${base}/api/media/seek`, {
        method: "POST",
        body: "{no es json",
      });
      assert.equal(broken.status, 400);
      assert.deepEqual(calls, []);
      assert.equal(after.count, 0);
    },
  );
});

test("afterAction se llama tras un éxito y no tras un fallo", async () => {
  await withMedia(
    controlReturning({ ok: true, devices: [] }),
    async ({ hit, after }) => {
      assert.equal((await hit(["POST", "pause"])).status, 200);
      assert.equal(
        (await hit(["POST", "seek", { positionMs: 5 }])).status,
        200,
      );
      assert.equal(after.count, 2);
    },
  );
  await withMedia(
    controlReturning(failure("unavailable")),
    async ({ hit, after }) => {
      await hit(["POST", "pause"]);
      assert.equal(after.count, 0);
    },
  );
});

test("cada ruta llama a su acción con el valor del body", async () => {
  const calls: string[] = [];
  await withMedia(
    controlReturning({ ok: true, devices: [] }, calls),
    async ({ hit }) => {
      for (const action of ROUTES) await hit(action);
      assert.deepEqual(calls, [
        "play",
        "pause",
        "next",
        "previous",
        "seek",
        "shuffle",
        "repeat",
        "transfer",
        "devices",
      ]);
    },
  );
});

test("GET /api/media/devices devuelve la lista", async () => {
  const devices = [
    {
      id: "a",
      name: "PC",
      type: "Computer",
      isActive: true,
      isRestricted: false,
    },
  ];
  await withMedia(
    controlReturning({ ok: true, devices }),
    async ({ hit, after }) => {
      const res = await hit(["GET", "devices"]);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { devices });
      // Leer dispositivos no es una orden: no fuerza una lectura del poller.
      assert.equal(after.count, 0);
    },
  );
});

test("POST /api/media/refresh avisa al poller y no toca Spotify", async () => {
  const calls: string[] = [];
  await withMedia(
    controlReturning({ ok: true, devices: [] }, calls),
    async ({ base, after }) => {
      const res = await fetch(`${base}/api/media/refresh`, { method: "POST" });
      assert.equal(res.status, 200);
      assert.equal(after.refreshes, 1);
      assert.deepEqual(calls, []);
      // No es una orden: no fuerza la lectura de "tras una acción".
      assert.equal(after.count, 0);
    },
  );
});
