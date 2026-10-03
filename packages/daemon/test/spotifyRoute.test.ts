import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSpotifyRoutes,
  PENDING_TTL_MS,
  type SpotifyRoutesDeps,
} from "../src/infrastructure/http/routes/spotify.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";
import type { SpotifyToken } from "../src/infrastructure/persistence/spotifyToken.ts";

const REDIRECT = "http://127.0.0.1:4747/api/spotify/callback";

async function withSpotify(
  overrides: Partial<SpotifyRoutesDeps>,
  fn: (ctx: {
    base: string;
    opened: string[];
    exchanges: { code: string; verifier: string; clientId: string }[];
    saved: SpotifyToken[];
    logouts: { count: number };
  }) => Promise<void>,
): Promise<void> {
  const opened: string[] = [];
  const exchanges: { code: string; verifier: string; clientId: string }[] = [];
  const saved: SpotifyToken[] = [];
  const logouts = { count: 0 };
  const server = createHttpServer({
    routes: createSpotifyRoutes({
      readClientId: () => "cid",
      redirectUri: REDIRECT,
      openBrowser: (url) => opened.push(url),
      exchangeCode: async (opts) => {
        exchanges.push({
          code: opts.code,
          verifier: opts.verifier,
          clientId: opts.clientId,
        });
        return {
          ok: true,
          accessToken: "a",
          refreshToken: "r",
          expiresAt: 123,
          scope: "s",
        };
      },
      saveToken: (t) => saved.push(t),
      logout: () => {
        logouts.count++;
      },
      ...overrides,
    }),
  });
  const port = await server.listen(0);
  try {
    await fn({
      base: `http://127.0.0.1:${port}`,
      opened,
      exchanges,
      saved,
      logouts,
    });
  } finally {
    await server.close();
  }
}

async function startLogin(base: string, opened: string[]): Promise<string> {
  const res = await fetch(`${base}/api/spotify/login`, { method: "POST" });
  assert.equal(res.status, 200);
  const state = new URL(opened.at(-1) as string).searchParams.get("state");
  assert.ok(state);
  return state;
}

test("callback con state desconocido: 400 legible y no intercambia nada", async () => {
  await withSpotify({}, async ({ base, exchanges, saved }) => {
    const res = await fetch(`${base}/api/spotify/callback?code=x&state=nope`);
    assert.equal(res.status, 400);
    assert.match(await res.text(), /Vuelve a pulsar Conectar/);
    assert.equal(exchanges.length, 0);
    assert.equal(saved.length, 0);
  });
});

test("flujo completo: login abre el navegador y el callback guarda el token", async () => {
  await withSpotify({}, async ({ base, opened, exchanges, saved }) => {
    const state = await startLogin(base, opened);
    const authorize = new URL(opened[0] as string);
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");

    const res = await fetch(
      `${base}/api/spotify/callback?code=abc&state=${state}`,
    );
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Spotify conectado/);
    assert.equal(exchanges.length, 1);
    assert.equal(exchanges[0]?.code, "abc");
    assert.equal(exchanges[0]?.clientId, "cid");
    assert.ok((exchanges[0]?.verifier.length ?? 0) >= 43);
    assert.deepEqual(saved, [
      { accessToken: "a", refreshToken: "r", expiresAt: 123, scope: "s" },
    ]);
  });
});

test("el state es de un solo uso", async () => {
  await withSpotify({}, async ({ base, opened, exchanges }) => {
    const state = await startLogin(base, opened);
    await fetch(`${base}/api/spotify/callback?code=abc&state=${state}`);
    const again = await fetch(
      `${base}/api/spotify/callback?code=abc&state=${state}`,
    );
    assert.equal(again.status, 400);
    assert.equal(exchanges.length, 1);
  });
});

test("state caducado tras el TTL se rechaza", async () => {
  let t = 1_000_000;
  await withSpotify({ now: () => t }, async ({ base, opened, exchanges }) => {
    const state = await startLogin(base, opened);
    t += PENDING_TTL_MS + 1;
    const res = await fetch(
      `${base}/api/spotify/callback?code=abc&state=${state}`,
    );
    assert.equal(res.status, 400);
    assert.equal(exchanges.length, 0);
  });
});

test("login sin Client ID responde 409 con el remedio", async () => {
  await withSpotify({ readClientId: () => null }, async ({ base, opened }) => {
    const res = await fetch(`${base}/api/spotify/login`, { method: "POST" });
    assert.equal(res.status, 409);
    const body = (await res.json()) as { remedy: string };
    assert.match(body.remedy, /amnis spotify login --client-id/);
    assert.equal(opened.length, 0);
  });
});

test("el usuario cancela en Spotify: 400 y sin intercambio", async () => {
  await withSpotify({}, async ({ base, opened, exchanges }) => {
    const state = await startLogin(base, opened);
    const res = await fetch(
      `${base}/api/spotify/callback?error=access_denied&state=${state}`,
    );
    assert.equal(res.status, 400);
    assert.equal(exchanges.length, 0);
  });
});

test("si el intercambio falla, 502 con el mensaje y sin guardar", async () => {
  await withSpotify(
    {
      exchangeCode: async () => ({
        ok: false,
        permanent: true,
        message: "<boom>",
      }),
    },
    async ({ base, opened, saved }) => {
      const state = await startLogin(base, opened);
      const res = await fetch(
        `${base}/api/spotify/callback?code=abc&state=${state}`,
      );
      assert.equal(res.status, 502);
      assert.match(await res.text(), /&lt;boom&gt;/);
      assert.equal(saved.length, 0);
    },
  );
});

test("logout: POST borra la sesión y responde 200; GET no está permitido (#90)", async () => {
  await withSpotify({}, async ({ base, logouts }) => {
    const get = await fetch(`${base}/api/spotify/logout`);
    assert.equal(get.status, 405);
    assert.equal(logouts.count, 0);

    const res = await fetch(`${base}/api/spotify/logout`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.equal(logouts.count, 1);
  });
});
