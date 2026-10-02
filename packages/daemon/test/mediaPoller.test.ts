import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import type { MediaSnapshot, MediaTrack } from "@amnis/shared";
import { startMediaPoller } from "../src/infrastructure/mediaPoller.ts";
import type { FeaturesResult } from "../src/infrastructure/providers/reccobeats/features.ts";
import {
  emptyMedia,
  type MediaReading,
} from "../src/infrastructure/providers/spotify/player.ts";
import { createTrackVibes } from "../src/infrastructure/trackVibe.ts";

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
    vibe: "neutral",
    bpm: null,
    ...overrides,
  };
}

function setup(
  next: () => MediaReading,
  opts: { playingMs?: number; idleMs?: number; activeWindowMs?: number } = {},
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
    // Por defecto sin margen de actividad: así los tests de cadencia miden
    // el intervalo base; el margen se prueba aparte.
    activeWindowMs: opts.activeWindowMs ?? 0,
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

test("pollSoon lee pronto, aunque el intervalo normal sea lento", async () => {
  const { state, poller } = setup(
    () => ({ snapshot: playing({ isPlaying: false }) }),
    { playingMs: 10_000, idleMs: 10_000 },
  );
  state.clients = 1;
  poller.wake();
  await sleep(20);
  assert.equal(state.reads, 1);
  poller.pollSoon(15);
  await sleep(60);
  poller.stop();
  assert.equal(state.reads, 2);
});

test("pollSoon sin clientes no lee", async () => {
  const { state, poller } = setup(() => ({ snapshot: playing() }));
  poller.pollSoon(5);
  await sleep(40);
  poller.stop();
  assert.equal(state.reads, 0);
});

test("varios pollSoon seguidos no apilan lecturas", async () => {
  const { state, poller } = setup(
    () => ({ snapshot: playing({ isPlaying: false }) }),
    { playingMs: 10_000, idleMs: 10_000 },
  );
  state.clients = 1;
  poller.wake();
  await sleep(20);
  poller.pollSoon(20);
  poller.pollSoon(20);
  poller.pollSoon(20);
  await sleep(80);
  poller.stop();
  assert.equal(state.reads, 2);
});

test("pollSoon con una lectura en vuelo: la siguiente es pronto, no al intervalo", async () => {
  let release: () => void = () => {};
  let first = true;
  const state = { reads: 0 };
  const poller = startMediaPoller({
    read: async () => {
      state.reads++;
      if (first) {
        first = false;
        await new Promise<void>((r) => {
          release = r;
        });
      }
      return { snapshot: playing({ isPlaying: false }) };
    },
    hasClients: () => true,
    onChange: () => {},
    playingMs: 10_000,
    idleMs: 10_000,
  });
  poller.wake(); // lectura 1, queda en vuelo
  await sleep(10);
  poller.pollSoon(15); // llega una orden: esa lectura es anterior a ella
  release();
  await sleep(80);
  poller.stop();
  assert.equal(state.reads, 2);
});

// ── Margen de actividad y refresco al mirar ──────────────────────────────

test("tras pasar a pausa se sigue sondeando rápido un rato, y luego despacio", async () => {
  let step = 0;
  const { state, poller } = setup(
    () => {
      step++;
      return { snapshot: playing({ isPlaying: step === 1 }) };
    },
    { playingMs: 10, idleMs: 400, activeWindowMs: 80 },
  );
  state.clients = 1;
  poller.wake();
  await sleep(130); // el margen (80 ms) ya ha vencido
  const readsAfterWindow = state.reads;
  assert.ok(
    readsAfterWindow >= 5,
    `ritmo rápido en el margen: ${readsAfterWindow}`,
  );
  await sleep(150);
  poller.stop();
  assert.equal(
    state.reads,
    readsAfterWindow,
    "pasado el margen, al ritmo lento",
  );
});

test("refresh con la música en pausa: lectura ya y ritmo rápido durante el margen", async () => {
  const { state, poller } = setup(
    () => ({ snapshot: playing({ isPlaying: false }) }),
    { playingMs: 10, idleMs: 400, activeWindowMs: 60 },
  );
  state.clients = 1;
  poller.wake();
  await sleep(120); // vence el margen del arranque; ahora va lento
  const before = state.reads;
  poller.refresh();
  await sleep(50);
  assert.ok(
    state.reads - before >= 3,
    `lecturas tras refresh: ${state.reads - before}`,
  );
  await sleep(120); // vence el margen del refresh
  const settled = state.reads;
  await sleep(150);
  poller.stop();
  assert.equal(state.reads, settled);
});

test("refresh sin clientes no lee", async () => {
  const { state, poller } = setup(() => ({ snapshot: playing() }));
  poller.refresh();
  await sleep(40);
  poller.stop();
  assert.equal(state.reads, 0);
});

test("refresh con datos recientes no duplica la lectura", async () => {
  const { state, poller } = setup(() => ({ snapshot: playing() }), {
    playingMs: 200,
    idleMs: 400,
  });
  state.clients = 1;
  poller.wake();
  await sleep(20);
  poller.refresh();
  poller.refresh();
  await sleep(30);
  poller.stop();
  assert.equal(state.reads, 1);
});

// ── Vibe de ReccoBeats (#63) ─────────────────────────────────────────────

function setupVibes(
  next: () => MediaReading,
  fetchFeatures: (id: string) => Promise<FeaturesResult>,
) {
  const state = {
    reads: 0,
    fetches: [] as string[],
    changes: [] as MediaSnapshot[],
  };
  const vibes = createTrackVibes({
    fetchFeatures: (id) => {
      state.fetches.push(id);
      return fetchFeatures(id);
    },
  });
  const poller = startMediaPoller({
    read: async () => {
      state.reads++;
      return next();
    },
    hasClients: () => true,
    onChange: (s) => state.changes.push(s),
    vibes,
    playingMs: 15,
    idleMs: 15,
  });
  return { state, poller, vibes };
}

const partyFeatures: FeaturesResult = {
  ok: true,
  features: { bpm: 128, energy: 0.9, valence: 0.9 },
};

test("ReccoBeats colgado: el media sale igual y a tiempo, con vibe neutral", async () => {
  const { state, poller } = setupVibes(
    () => ({ snapshot: playing() }),
    () => new Promise(() => {}), // no resuelve nunca
  );
  poller.wake();
  await sleep(40);
  poller.stop();
  assert.equal(state.changes.length, 1);
  assert.equal(state.changes[0]?.vibe, "neutral");
  assert.equal(state.changes[0]?.bpm, null);
});

test("cuando llegan los datos sale un segundo media con la vibe y el bpm, sin parpadeo después", async () => {
  const { state, poller } = setupVibes(
    () => ({ snapshot: playing() }),
    async () => {
      await sleep(20);
      return partyFeatures;
    },
  );
  poller.wake();
  await sleep(120);
  poller.stop();
  assert.ok(state.reads >= 4, `lecturas: ${state.reads}`);
  assert.deepEqual(
    state.changes.map((c) => [c.vibe, c.bpm]),
    [
      ["neutral", null],
      ["fiesta", 128],
    ],
  );
  assert.equal(state.fetches.length, 1);
});

test("ReccoBeats caído: una sola consulta por pista aunque se lea varias veces", async () => {
  let id = "t1";
  const { state, poller } = setupVibes(
    () => ({
      snapshot: playing({
        track: { ...(playing().track as MediaTrack), id },
      }),
    }),
    async () => ({ ok: false, message: "caído" }),
  );
  poller.wake();
  await sleep(70);
  assert.ok(state.reads >= 3, `lecturas: ${state.reads}`);
  assert.deepEqual(state.fetches, ["t1"]);
  id = "t2"; // cambia de pista: vuelve a intentarlo, una vez
  await sleep(70);
  poller.stop();
  assert.deepEqual(state.fetches, ["t1", "t2"]);
  assert.ok(state.changes.every((c) => c.vibe === "neutral"));
});

test("con la vibe en caché, el primer media ya la lleva y no hay consulta", async () => {
  const { state, poller, vibes } = setupVibes(
    () => ({ snapshot: playing() }),
    async () => partyFeatures,
  );
  await vibes.resolve("t1"); // ya oída antes
  state.fetches.length = 0;
  poller.wake();
  await sleep(50);
  poller.stop();
  assert.equal(state.changes.length, 1);
  assert.deepEqual(
    [state.changes[0]?.vibe, state.changes[0]?.bpm],
    ["fiesta", 128],
  );
  assert.equal(state.fetches.length, 0);
});

test("un resultado que llega cuando ya cambió la pista se descarta", async () => {
  let id = "t1";
  const { state, poller } = setupVibes(
    () => ({
      snapshot: playing({ track: { ...(playing().track as MediaTrack), id } }),
    }),
    async (requested) => {
      if (requested === "t1") {
        await sleep(60);
        return partyFeatures;
      }
      return new Promise(() => {}); // la nueva pista nunca resuelve
    },
  );
  poller.wake();
  await sleep(20);
  id = "t2";
  await sleep(100); // el resultado de t1 llega aquí, con t2 sonando
  poller.stop();
  assert.ok(state.changes.length >= 2);
  assert.ok(
    state.changes.every((c) => c.vibe === "neutral"),
    "no debe pintarse la vibe de la pista anterior",
  );
});

test("un episodio (podcast) no consulta a ReccoBeats", async () => {
  const { state, poller } = setupVibes(
    () => ({ snapshot: playing({ vibe: "podcast" }) }),
    async () => partyFeatures,
  );
  poller.wake();
  await sleep(50);
  poller.stop();
  assert.equal(state.fetches.length, 0);
  assert.equal(state.changes[0]?.vibe, "podcast");
});

test("peek() devuelve el último snapshot sin leer, y null antes de la primera lectura", async () => {
  const { state, poller } = setup(() => ({ snapshot: playing() }));
  assert.equal(poller.peek(), null);
  state.clients = 1;
  await poller.snapshot();
  const reads = state.reads;
  assert.equal(poller.peek()?.track?.id, "t1");
  assert.equal(state.reads, reads);
  poller.stop();
});
