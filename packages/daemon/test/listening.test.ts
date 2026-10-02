import assert from "node:assert/strict";
import { test } from "node:test";
import type { MediaSnapshot } from "@amnis/shared";
import {
  deriveListening,
  LISTENING_GRACE_MS,
  type ListeningMemory,
  NO_LISTENING,
} from "../src/domain/listening.ts";
import { emptyMedia } from "../src/infrastructure/providers/spotify/player.ts";

const T0 = Date.parse("2026-01-01T00:00:00.000Z");
const at = (seconds: number) => new Date(T0 + seconds * 1000);

function media(over: Partial<MediaSnapshot> = {}): MediaSnapshot {
  return {
    ...emptyMedia("ok", "2026-01-01T00:00:00.000Z"),
    isPlaying: true,
    track: {
      id: "t1",
      title: "Canción",
      artists: ["A", "B"],
      album: "Álbum",
      imageUrl: "https://i.scdn.co/x",
      durationMs: 200_000,
    },
    vibe: "chill",
    bpm: 90,
    ...over,
  };
}

function run(steps: [number, MediaSnapshot | null][]): ListeningMemory[] {
  const out: ListeningMemory[] = [];
  let mem = NO_LISTENING;
  for (const [seconds, m] of steps) {
    mem = deriveListening(mem, m, at(seconds));
    out.push(mem);
  }
  return out;
}

test("sonando: listening con vibe, bpm y pista (artistas unidos)", () => {
  const [mem] = run([[0, media()]]);
  assert.deepEqual(mem?.listening, {
    vibe: "chill",
    bpm: 90,
    track: {
      id: "t1",
      title: "Canción",
      artist: "A, B",
      imageUrl: "https://i.scdn.co/x",
    },
  });
});

test("sin música desde el principio: null", () => {
  const [mem] = run([[0, media({ isPlaying: false })]]);
  assert.equal(mem?.listening, null);
});

test("pausar 5 s y reanudar no emite null; pausar 20 s sí", () => {
  const paused = media({ isPlaying: false });
  const short = run([
    [0, media()],
    [3, paused],
    [8, paused],
    [9, media()],
  ]);
  assert.ok(short.every((m) => m.listening !== null));

  const long = run([
    [0, media()],
    [1, paused],
    [1 + LISTENING_GRACE_MS / 1000 - 1, paused],
    [1 + 20, paused],
  ]);
  assert.notEqual(long[2]?.listening, null);
  assert.equal(long[3]?.listening, null);
});

test("la gracia cuenta desde la pausa, no desde el último check", () => {
  // Sonaba en t=0; el siguiente check, mucho después, ya lo ve en pausa.
  const [, afterLongGap] = run([
    [0, media()],
    [600, media({ isPlaying: false })],
  ]);
  assert.notEqual(afterLongGap?.listening, null);
});

test("sin pista o con status distinto de ok cuenta como no sonar", () => {
  for (const m of [
    media({ track: null }),
    media({ status: "unavailable" }),
    null,
  ]) {
    const [first, later] = run([
      [0, media()],
      [1, m],
    ]);
    assert.notEqual(first?.listening, null);
    assert.equal(later?.playing, false);
  }
  const [, gone] = run([
    [0, media()],
    [1, null],
    [100, null],
  ]).slice(1);
  assert.equal(gone?.listening, null);
});

test("podcast conserva bpm null", () => {
  const [mem] = run([[0, media({ vibe: "podcast", bpm: null })]]);
  assert.equal(mem?.listening?.vibe, "podcast");
  assert.equal(mem?.listening?.bpm, null);
});
