import assert from "node:assert/strict";
import { test } from "node:test";
import type { MediaSnapshot, PetSnapshot } from "@amnis/shared";
import type { LastKnownStateEvent } from "../src/application/getState.ts";
import { LISTENING_GRACE_MS } from "../src/domain/listening.ts";
import { SLEEP_AFTER_MS } from "../src/domain/petState.ts";
import { startPetStateWatcher } from "../src/infrastructure/petStateWatcher.ts";

const STARTED_AT = "2026-01-01T00:00:00.000Z";

function makeWatcher(
  lastEvent: () => LastKnownStateEvent | null,
  getCachedExhausted: () => boolean = () => false,
  readCommitHash: (project: string) => string | null = () => null,
  getCachedMedia: () => MediaSnapshot | null = () => null,
) {
  const broadcasts: PetSnapshot[] = [];
  const watcher = startPetStateWatcher({
    lastKnownStateEvent: lastEvent,
    startedAt: STARTED_AT,
    getCachedFatigue: () => 0.5,
    getCachedExhausted,
    getCachedMedia,
    readCommitHash,
    broadcast: (snapshot) => broadcasts.push(snapshot),
    intervalMs: 3_600_000,
  });
  return { watcher, broadcasts };
}

test("arranca sin eventos: el primer check broadcastea sleeping", () => {
  const { watcher, broadcasts } = makeWatcher(() => null);

  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0]?.state, "sleeping");
  watcher.stop();
});

test("check() con el mismo estado consecutivo no vuelve a broadcastear", () => {
  const event: LastKnownStateEvent = {
    hook: "PreToolUse",
    toolName: "Edit",
    derivedState: "coding",
    ts: "2026-01-01T00:00:00.000Z",
    project: null,
    stateEnteredAt: "2026-01-01T00:00:00.000Z",
  };
  const { watcher, broadcasts } = makeWatcher(() => event);

  // El check automático al arrancar usa el reloj real, muy posterior a
  // 2026-01-01: arranca dormido. `check()` con un `now` cercano al evento
  // despierta — es la primera transición real, cuenta como broadcast.
  watcher.check(new Date("2026-01-01T00:00:01.000Z"));
  assert.equal(broadcasts.at(-1)?.state, "coding");
  const afterWake = broadcasts.length;

  watcher.check(new Date("2026-01-01T00:00:02.000Z"));

  assert.equal(broadcasts.length, afterWake);
  watcher.stop();
});

test("check() con un estado distinto broadcastea de nuevo", () => {
  let derivedState = "coding";
  const { watcher, broadcasts } = makeWatcher(() => ({
    hook: "PreToolUse",
    toolName: "Edit",
    derivedState,
    ts: "2026-01-01T00:00:00.000Z",
    project: null,
    stateEnteredAt: "2026-01-01T00:00:00.000Z",
  }));

  assert.equal(broadcasts.length, 1);
  derivedState = "testing";
  watcher.check(new Date("2026-01-01T00:00:01.000Z"));

  assert.equal(broadcasts.length, 2);
  assert.equal(broadcasts[1]?.state, "testing");
  watcher.stop();
});

test("evento antiguo (idle): check() transiciona a sleeping y broadcastea", () => {
  const event: LastKnownStateEvent = {
    hook: "PreToolUse",
    toolName: "Edit",
    derivedState: "coding",
    ts: "2026-01-01T00:00:00.000Z",
    project: null,
    stateEnteredAt: "2026-01-01T00:00:00.000Z",
  };
  const { watcher, broadcasts } = makeWatcher(() => event);

  watcher.check(new Date("2026-01-01T00:00:01.000Z")); // despierta: coding
  assert.equal(broadcasts.at(-1)?.state, "coding");
  const beforeSleep = broadcasts.length;

  watcher.check(new Date("2026-01-01T00:15:00.000Z")); // idle > 10 min

  assert.equal(broadcasts.length, beforeSleep + 1);
  assert.equal(broadcasts.at(-1)?.state, "sleeping");
  watcher.stop();
});

test("el snapshot broadcastado lleva la fatiga cacheada", () => {
  const { watcher, broadcasts } = makeWatcher(() => null);
  assert.equal(broadcasts[0]?.fatigue, 0.5);
  watcher.stop();
});

test("pasar de exhausted false→true broadcastea limited; repetirlo no vuelve a emitir", () => {
  let exhausted = false;
  const { watcher, broadcasts } = makeWatcher(
    () => null,
    () => exhausted,
  );
  const beforeLimit = broadcasts.length;

  exhausted = true;
  watcher.check(new Date("2026-01-01T00:00:01.000Z"));
  assert.equal(broadcasts.length, beforeLimit + 1);
  assert.equal(broadcasts.at(-1)?.state, "limited");

  watcher.check(new Date("2026-01-01T00:00:02.000Z"));
  assert.equal(broadcasts.length, beforeLimit + 1);
  watcher.stop();
});

test("pushing lleva el commitHash de readCommitHash(project)", () => {
  const event: LastKnownStateEvent = {
    hook: "PreToolUse",
    toolName: "Bash",
    derivedState: "pushing",
    ts: "2026-01-01T00:00:00.000Z",
    project: "/repo",
    stateEnteredAt: "2026-01-01T00:00:00.000Z",
  };
  const { watcher, broadcasts } = makeWatcher(
    () => event,
    () => false,
    (project) => (project === "/repo" ? "cafe123" : null),
  );

  watcher.check(new Date("2026-01-01T00:00:01.000Z"));

  assert.equal(broadcasts.at(-1)?.state, "pushing");
  assert.equal(broadcasts.at(-1)?.commitHash, "cafe123");
  watcher.stop();
});

const T0 = "2026-01-01T00:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000);

function music(isPlaying: boolean, progressMs = 0): MediaSnapshot {
  return {
    status: "ok",
    isPlaying,
    track: {
      id: "t1",
      title: "Canción",
      artists: ["A", "B"],
      album: "Álbum",
      imageUrl: null,
      durationMs: 200_000,
    },
    progressMs,
    measuredAt: T0,
    shuffle: false,
    repeat: "off",
    device: null,
    vibe: "fiesta",
    bpm: 128,
  };
}

const codingEvent: LastKnownStateEvent = {
  hook: "PreToolUse",
  toolName: "Edit",
  derivedState: "coding",
  ts: T0,
  project: null,
  stateEnteredAt: T0,
};

test("cambiar listening emite con el mismo state: nunca lo altera", () => {
  let media: MediaSnapshot | null = null;
  const { watcher, broadcasts } = makeWatcher(
    () => codingEvent,
    () => false,
    () => null,
    () => media,
  );
  watcher.check(at(1));
  const before = broadcasts.length;
  assert.equal(broadcasts.at(-1)?.listening, null);

  media = music(true);
  watcher.check(at(2));

  assert.equal(broadcasts.length, before + 1);
  assert.equal(broadcasts.at(-1)?.state, "coding");
  assert.deepEqual(broadcasts.at(-1)?.listening, {
    vibe: "fiesta",
    bpm: 128,
    track: { id: "t1", title: "Canción", artist: "A, B", imageUrl: null },
  });
  watcher.stop();
});

test("sin hooks más de SLEEP_AFTER_MS y con música: sleeping con listening no nulo", () => {
  const { watcher, broadcasts } = makeWatcher(
    () => codingEvent,
    () => false,
    () => null,
    () => music(true),
  );

  watcher.check(at(SLEEP_AFTER_MS / 1000 + 60));

  assert.equal(broadcasts.at(-1)?.state, "sleeping");
  assert.notEqual(broadcasts.at(-1)?.listening, null);
  assert.equal(watcher.listening()?.track.id, "t1");
  watcher.stop();
});

test("cambiar solo el progreso del media no emite", () => {
  let media: MediaSnapshot | null = music(true, 1_000);
  const { watcher, broadcasts } = makeWatcher(
    () => codingEvent,
    () => false,
    () => null,
    () => media,
  );
  watcher.check(at(1));
  const before = broadcasts.length;

  media = music(true, 4_000);
  watcher.check(at(4));

  assert.equal(broadcasts.length, before);
  watcher.stop();
});

test("pausa corta no apaga listening; pausa larga sí, sin tocar state", () => {
  let media: MediaSnapshot | null = music(true);
  const { watcher, broadcasts } = makeWatcher(
    () => codingEvent,
    () => false,
    () => null,
    () => media,
  );
  watcher.check(at(1));

  media = music(false);
  watcher.check(at(2));
  watcher.check(at(7)); // 5 s en pausa
  assert.notEqual(watcher.listening(), null);
  media = music(true);
  watcher.check(at(8));
  assert.notEqual(watcher.listening(), null);

  media = music(false);
  watcher.check(at(9));
  watcher.check(at(9 + LISTENING_GRACE_MS / 1000 + 5));

  assert.equal(watcher.listening(), null);
  assert.equal(broadcasts.at(-1)?.listening, null);
  assert.equal(broadcasts.at(-1)?.state, "coding");
  watcher.stop();
});
