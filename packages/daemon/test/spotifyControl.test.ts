import assert from "node:assert/strict";
import { test } from "node:test";
import { createMediaControl } from "../src/infrastructure/providers/spotify/control.ts";
import type { LoadSpotifyTokenResult } from "../src/infrastructure/providers/spotify/session.ts";

interface Call {
  url: string;
  method: string;
  auth: string | null;
  contentType: string | null;
  body: string | undefined;
}

/** `fetch` falso que responde con la cola dada y registra cada petición. */
function fakeFetch(...responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      auth: headers.get("Authorization"),
      contentType: headers.get("Content-Type"),
      body: init?.body as string | undefined,
    });
    const next = responses.shift() ?? new Response(null, { status: 204 });
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { impl, calls };
}

function tokens(...results: LoadSpotifyTokenResult[]) {
  const forces: boolean[] = [];
  const impl = (async (opts: { force?: boolean } = {}) => {
    forces.push(opts.force === true);
    return results.shift() ?? ({ ok: true, accessToken: "tok" } as const);
  }) as never;
  return { impl, forces };
}

const API = "https://api.spotify.com/v1/me/player";

function setup(...responses: (Response | Error)[]) {
  const f = fakeFetch(...responses);
  const t = tokens();
  return {
    calls: f.calls,
    forces: t.forces,
    control: createMediaControl({ fetch: f.impl, loadToken: t.impl }),
  };
}

function spotifyError(status: number, reason: string, message = "x") {
  return Response.json({ error: { status, reason, message } }, { status });
}

test("cada acción llama al método, URL, query y body exactos", async () => {
  const cases: [
    string,
    (c: ReturnType<typeof setup>["control"]) => Promise<unknown>,
    string,
    string,
    string?,
  ][] = [
    ["play", (c) => c.play(), "PUT", `${API}/play`],
    ["pause", (c) => c.pause(), "PUT", `${API}/pause`],
    ["next", (c) => c.next(), "POST", `${API}/next`],
    ["previous", (c) => c.previous(), "POST", `${API}/previous`],
    ["seek", (c) => c.seek(42_000), "PUT", `${API}/seek?position_ms=42000`],
    ["shuffle", (c) => c.setShuffle(true), "PUT", `${API}/shuffle?state=true`],
    ["repeat", (c) => c.setRepeat("track"), "PUT", `${API}/repeat?state=track`],
    [
      "transfer",
      (c) => c.transfer("dev1"),
      "PUT",
      API,
      JSON.stringify({ device_ids: ["dev1"], play: true }),
    ],
  ];
  for (const [name, run, method, url, body] of cases) {
    const s = setup();
    const result = await run(s.control);
    assert.deepEqual(result, { ok: true }, name);
    assert.equal(s.calls.length, 1, name);
    assert.equal(s.calls[0]?.method, method, name);
    assert.equal(s.calls[0]?.url, url, name);
    assert.equal(s.calls[0]?.auth, "Bearer tok", name);
    assert.equal(s.calls[0]?.body, body, name);
    assert.equal(
      s.calls[0]?.contentType,
      body ? "application/json" : null,
      name,
    );
  }
});

test("404 NO_ACTIVE_DEVICE es no-device; otro 404 es unavailable", async () => {
  const noDevice = await setup(
    spotifyError(404, "NO_ACTIVE_DEVICE"),
  ).control.pause();
  assert.equal(!noDevice.ok && noDevice.kind, "no-device");
  assert.match(!noDevice.ok ? noDevice.message : "", /Abre Spotify/);

  const other = await setup(spotifyError(404, "OTRA_COSA")).control.pause();
  assert.equal(!other.ok && other.kind, "unavailable");
});

test("403 PREMIUM_REQUIRED se explica; otro 403 es forbidden genérico", async () => {
  const premium = await setup(
    spotifyError(403, "PREMIUM_REQUIRED"),
  ).control.next();
  assert.equal(!premium.ok && premium.kind, "forbidden");
  assert.match(!premium.ok ? premium.message : "", /Premium/);

  const other = await setup(
    spotifyError(403, "UNKNOWN", "Restriction violated"),
  ).control.next();
  assert.equal(!other.ok && other.kind, "forbidden");
  assert.doesNotMatch(!other.ok ? other.message : "", /Premium/);
  assert.match(!other.ok ? other.message : "", /Restriction violated/);
});

test("429 respeta Retry-After y sin cabecera espera un minuto", async () => {
  const withHeader = await setup(
    new Response(null, { status: 429, headers: { "Retry-After": "7" } }),
  ).control.play();
  assert.deepEqual(
    [
      !withHeader.ok && withHeader.kind,
      !withHeader.ok && withHeader.retryAfterMs,
    ],
    ["rate-limited", 7000],
  );

  const without = await setup(
    new Response(null, { status: 429 }),
  ).control.play();
  assert.equal(!without.ok && without.retryAfterMs, 60_000);
});

test("401 hace un refresco forzado y un solo reintento que tiene éxito", async () => {
  const s = setup(
    new Response(null, { status: 401 }),
    new Response(null, { status: 204 }),
  );
  const result = await s.control.pause();
  assert.deepEqual(result, { ok: true });
  assert.equal(s.calls.length, 2);
  assert.deepEqual(s.forces, [false, true]);
});

test("dos 401 seguidos acaban en not-logged-in, sin bucle", async () => {
  const s = setup(
    new Response(null, { status: 401 }),
    new Response(null, { status: 401 }),
  );
  const result = await s.control.pause();
  assert.equal(!result.ok && result.kind, "not-logged-in");
  assert.equal(s.calls.length, 2);
});

test("sin token no toca la red", async () => {
  const f = fakeFetch();
  const control = createMediaControl({
    fetch: f.impl,
    loadToken: tokens({
      ok: false,
      reason: "not-logged-in",
      message: "Sin sesión de Spotify.",
    }).impl,
  });
  const result = await control.play();
  assert.equal(!result.ok && result.kind, "not-logged-in");
  assert.equal(f.calls.length, 0);
});

test("un fallo al refrescar el token es unavailable, no not-logged-in", async () => {
  const control = createMediaControl({
    fetch: fakeFetch().impl,
    loadToken: tokens({
      ok: false,
      reason: "refresh-failed",
      message: "red",
    }).impl,
  });
  const result = await control.play();
  assert.equal(!result.ok && result.kind, "unavailable");
});

test("fallo de red y 5xx son unavailable", async () => {
  const net = await setup(new Error("sin red")).control.play();
  assert.equal(!net.ok && net.kind, "unavailable");
  const server = await setup(
    new Response(null, { status: 503 }),
  ).control.play();
  assert.equal(!server.ok && server.kind, "unavailable");
});

test("devices() mapea la lista", async () => {
  const s = setup(
    Response.json({
      devices: [
        { id: "a", name: "PC", type: "Computer", is_active: true },
        { id: null, name: "Móvil", type: "Smartphone", is_active: false },
      ],
    }),
  );
  const result = await s.control.devices();
  assert.deepEqual(result, {
    ok: true,
    devices: [
      { id: "a", name: "PC", type: "Computer", isActive: true },
      { id: null, name: "Móvil", type: "Smartphone", isActive: false },
    ],
  });
  assert.equal(s.calls[0]?.url, `${API}/devices`);
  assert.equal(s.calls[0]?.method, "GET");
});

test("devices() traduce los errores igual que las órdenes", async () => {
  const result = await setup(
    spotifyError(403, "PREMIUM_REQUIRED"),
  ).control.devices();
  assert.equal(!result.ok && result.kind, "forbidden");
});
