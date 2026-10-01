import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import type { MediaSnapshot, MediaTrack } from "@amnis/shared";
import { startMediaPoller } from "../src/infrastructure/mediaPoller.ts";
import {
  emptyMedia,
  type MediaReading,
} from "../src/infrastructure/providers/spotify/player.ts";

function playing(
  overrides: Partial<MediaSnapshot> = {},
  measuredAt = new Date().toISOString(),
): MediaSnapshot {
  return {
    status: "ok",
    isPlaying: true,
    track: {
      id: "t1",
      title: "Canción",
      artists: ["A"],
      album: "Álbum",
      imageUrl: null,
      durationMs: 200_000,
    },
    progressMs: 10_000,
    measuredAt,
    shuffle: false,
    repeat: "off",
    device: { id: "d", name: "Móvil", type: "Smartphone" },
    ...overrides,
  };
}

function setup(
  next: () => MediaReading,
  opts: { playingMs?: number; idleMs?: number } = {},
) {
  const state = { clients: 0, reads: 0, changes: [] as MediaSnapshot[] };
  const poller = startMediaPoller({
    read: async () => {
      state.reads++;
      return next();
    },
    hasClients: () => state.clients > 0,
    onChange: (s) => state.changes.push(s),
    playingMs: opts.playingMs ?? 15,
    idleMs: opts.idleMs ?? 15,
  });
  return { state, poller };
}

test("sin clientes SSE no hay ninguna lectura, ni con wake() ni con el tiempo", async () => {
  const { state, poller } = setup(() => ({ snapshot: playing() }));
  poller.wake();
  poller.pollNow();
  await sleep(80);
  poller.stop();
  assert.equal(state.reads, 0);
});

test("con un cliente lee ya y sigue leyendo sonando", async () => {
  const { state, poller } = setup(() => ({ snapshot: playing() }));
  state.clients = 1;
  poller.wake();
  await sleep(80);
  poller.stop();
  assert.ok(state.reads >= 3, `lecturas: ${state.reads}`);
});

test("en pausa lee al intervalo lento, no al rápido", async () => {
  const { state, poller } = setup(
    () => ({ snapshot: playing({ isPlaying: false }) }),
    { playingMs: 10, idleMs: 200 },
  );
  state.clients = 1;
  poller.wake();
  await sleep(80);
  poller.stop();
  assert.equal(state.reads, 1);
});

test("al irse el último cliente deja de leer", async () => {
  const { state, poller } = setup(() => ({ snapshot: playing() }));
  state.clients = 1;
  poller.wake();
  await sleep(50);
  state.clients = 0;
  await sleep(30); // deja terminar la lectura en vuelo
  const readsAtLeave = state.reads;
  await sleep(80);
  poller.stop();
  assert.equal(state.reads, readsAtLeave);
});

test("solo avanza el progreso: no emite; cambio de canción: sí", async () => {
  const t0 = Date.now();
  let step = 0;
  const { state, poller } = setup(
    () => {
      step++;
      const at = new Date(t0 + step * 1000).toISOString();
      const title = step >= 3 ? "Otra" : "Canción";
      return {
        snapshot: playing(
          {
            progressMs: 10_000 + step * 1000,
            track: { ...(playing().track as MediaTrack), title },
          },
          at,
        ),
      };
    },
    { playingMs: 5, idleMs: 5 },
  );
  state.clients = 1;
  poller.wake();
  await sleep(60);
  poller.stop();
  // Lectura 1 (primera) y lectura 3 (cambia el título).
  assert.equal(state.changes.length, 2);
  assert.equal(state.changes[1]?.track?.title, "Otra");
});

test("un seek (salto de progreso) sí emite", async () => {
  const t0 = Date.now();
  let step = 0;
  const { state, poller } = setup(
    () => {
      step++;
      const at = new Date(t0 + step * 1000).toISOString();
      const progressMs = step === 1 ? 10_000 : 120_000;
      return { snapshot: playing({ progressMs }, at) };
    },
    { playingMs: 5, idleMs: 5 },
  );
  state.clients = 1;
  poller.wake();
  await sleep(40);
  poller.stop();
  assert.equal(state.changes.length, 2);
});

test("un 429 respeta Retry-After y no relee antes", async () => {
  const { state, poller } = setup(
    () => ({
      snapshot: emptyMedia("unavailable", new Date().toISOString()),
      retryAfterMs: 300,
    }),
    { playingMs: 5, idleMs: 5 },
  );
  state.clients = 1;
  poller.wake();
  await sleep(100);
  poller.stop();
  assert.equal(state.reads, 1);
});

test("snapshot() reutiliza el reciente y no duplica la lectura en vuelo", async () => {
  const { state, poller } = setup(() => ({ snapshot: playing() }), {
    playingMs: 10_000,
    idleMs: 10_000,
  });
  const [a, b] = await Promise.all([poller.snapshot(), poller.snapshot()]);
  const c = await poller.snapshot();
  poller.stop();
  assert.equal(state.reads, 1);
  assert.equal(a, b);
  assert.equal(a, c);
});
