import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  fetchPlayer,
  readMedia,
  toMediaSnapshot,
} from "../src/infrastructure/providers/spotify/player.ts";

const AT = "2026-01-01T00:00:00.000Z";
const NOW = new Date(AT);
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeFetch(response: Response | Error): { calls: string[] } {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
  return { calls };
}

const trackBody = {
  is_playing: true,
  progress_ms: 1234,
  shuffle_state: true,
  repeat_state: "context",
  device: { id: "d1", name: "Móvil", type: "Smartphone" },
  item: {
    id: "t1",
    name: "Canción",
    duration_ms: 200_000,
    artists: [{ name: "A" }, { name: "B" }],
    album: { name: "Álbum", images: [{ url: "http://img/1" }] },
  },
};

test("toMediaSnapshot mapea una canción", () => {
  assert.deepEqual(toMediaSnapshot(trackBody, AT), {
    status: "ok",
    isPlaying: true,
    track: {
      id: "t1",
      title: "Canción",
      artists: ["A", "B"],
      album: "Álbum",
      imageUrl: "http://img/1",
      durationMs: 200_000,
    },
    progressMs: 1234,
    measuredAt: AT,
    shuffle: true,
    repeat: "context",
    device: { id: "d1", name: "Móvil", type: "Smartphone" },
    vibe: "neutral",
    bpm: null,
  });
});

test("toMediaSnapshot usa el programa como artista en un episodio", () => {
  const snapshot = toMediaSnapshot(
    {
      ...trackBody,
      item: {
        id: "e1",
        name: "Episodio",
        duration_ms: 1000,
        show: { name: "Podcast" },
        images: [{ url: "http://img/ep" }],
      },
    },
    AT,
  );
  assert.deepEqual(snapshot.track?.artists, ["Podcast"]);
  assert.equal(snapshot.track?.imageUrl, "http://img/ep");
});

test("un episodio es podcast sin bpm; una pista, neutral hasta que llegue ReccoBeats", () => {
  const episode = toMediaSnapshot(
    {
      ...trackBody,
      item: { id: "e1", name: "Ep", duration_ms: 1, show: { name: "P" } },
    },
    AT,
  );
  assert.equal(episode.vibe, "podcast");
  assert.equal(episode.bpm, null);
  const track = toMediaSnapshot(trackBody, AT);
  assert.equal(track.vibe, "neutral");
  assert.equal(track.bpm, null);
});

test("toMediaSnapshot con item null (anuncio): ok sin pista", () => {
  const snapshot = toMediaSnapshot({ ...trackBody, item: null }, AT);
  assert.equal(snapshot.status, "ok");
  assert.equal(snapshot.track, null);
});

test("repeat desconocido cae a off", () => {
  assert.equal(
    toMediaSnapshot({ ...trackBody, repeat_state: "raro" }, AT).repeat,
    "off",
  );
});

test("fetchPlayer: 200 mapea y envía el Bearer", async () => {
  let auth: string | null = null;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    auth = new Headers(init?.headers).get("Authorization");
    return Response.json(trackBody);
  }) as typeof fetch;
  const { snapshot } = await fetchPlayer("tok", NOW);
  assert.equal(snapshot.status, "ok");
  assert.equal(auth, "Bearer tok");
});

test("fetchPlayer: 204 es no-device", async () => {
  fakeFetch(new Response(null, { status: 204 }));
  const { snapshot } = await fetchPlayer("tok", NOW);
  assert.equal(snapshot.status, "no-device");
});

test("fetchPlayer: 429 respeta Retry-After y no deja el dato anterior", async () => {
  fakeFetch(
    new Response(null, { status: 429, headers: { "Retry-After": "7" } }),
  );
  const reading = await fetchPlayer("tok", NOW);
  assert.equal(reading.retryAfterMs, 7000);
  assert.equal(reading.snapshot.status, "unavailable");
  assert.equal(reading.snapshot.track, null);
});

test("fetchPlayer: 429 sin Retry-After espera un minuto", async () => {
  fakeFetch(new Response(null, { status: 429 }));
  assert.equal((await fetchPlayer("tok", NOW)).retryAfterMs, 60_000);
});

test("fetchPlayer: 500 y fallo de red degradan a unavailable", async () => {
  fakeFetch(new Response(null, { status: 500 }));
  assert.equal((await fetchPlayer("tok", NOW)).snapshot.status, "unavailable");
  fakeFetch(new Error("sin red"));
  assert.equal((await fetchPlayer("tok", NOW)).snapshot.status, "unavailable");
});

test("readMedia sin Client ID o sin sesión no toca la red", async () => {
  const { calls } = fakeFetch(new Response(null, { status: 204 }));
  const noClient = await readMedia(NOW, async () => ({
    ok: false,
    reason: "no-client-id",
    message: "x",
  }));
  const noLogin = await readMedia(NOW, async () => ({
    ok: false,
    reason: "not-logged-in",
    message: "x",
  }));
  assert.equal(noClient.snapshot.status, "not-configured");
  assert.equal(noLogin.snapshot.status, "not-logged-in");
  assert.equal(calls.length, 0);
});

test("readMedia con token válido consulta Spotify", async () => {
  const { calls } = fakeFetch(Response.json(trackBody));
  const { snapshot } = await readMedia(NOW, async () => ({
    ok: true,
    accessToken: "tok",
  }));
  assert.equal(snapshot.status, "ok");
  assert.equal(calls.length, 1);
});
