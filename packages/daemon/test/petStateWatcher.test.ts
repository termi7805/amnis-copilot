import assert from "node:assert/strict";
import { test } from "node:test";
import type { MediaSnapshot, PetFocus, PetSnapshot } from "@amnis/shared";
import type {
  LastKnownStateEvent,
  LiveSessionCandidate,
} from "../src/application/getState.ts";
import { LISTENING_GRACE_MS } from "../src/domain/listening.ts";
import { SLEEP_AFTER_MS } from "../src/domain/petState.ts";
import type { SessionSlot } from "../src/domain/sessionSlots.ts";
import { startPetStateWatcher } from "../src/infrastructure/petStateWatcher.ts";

const STARTED_AT = "2026-01-01T00:00:00.000Z";

function makeWatcher(
  lastEvent: (focus: PetFocus) => LastKnownStateEvent | null,
  getCachedExhausted: () => boolean = () => false,
  readCommitHash: (project: string) => string | null = () => null,
  getCachedMedia: () => MediaSnapshot | null = () => null,
  focus: () => PetFocus = () => ({ kind: "auto" }),
  liveSessions: () => LiveSessionCandidate[] = () => [],
) {
  const broadcasts: PetSnapshot[] = [];
  let slots: SessionSlot[] = [];
  const sessionSlots = {
    get: () => slots,
    set: (next: SessionSlot[]) => {
      slots = next;
    },
  };
  const watcher = startPetStateWatcher({
    focus,
    lastKnownStateEvent: lastEvent,
    liveSessionCandidates: liveSessions,
    startedAt: STARTED_AT,
    getCachedFatigue: () => 0.5,
    getCachedExhausted,
    getCachedMedia,
    readCommitHash,
    sessionSlots,
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

test("cambiar el foco emite un snapshot aunque el estado sea el mismo", () => {
  let focus: PetFocus = { kind: "auto" };
  const { watcher, broadcasts } = makeWatcher(
    () => null,
    () => false,
    () => null,
    () => null,
    () => focus,
  );
  assert.equal(broadcasts.length, 1);

  watcher.check();
  assert.equal(broadcasts.length, 1);

  focus = { kind: "worktree", worktree: "/r/wt" };
  watcher.check();
  assert.equal(broadcasts.length, 2);
  assert.deepEqual(broadcasts[1]?.focus, focus);
  assert.equal(broadcasts[1]?.state, "sleeping");
  watcher.stop();
});

test("lastKnownStateEvent recibe el foco vigente", () => {
  const seen: PetFocus[] = [];
  const focus: PetFocus = { kind: "repo", repoRoot: "/r" };
  const { watcher } = makeWatcher(
    (f) => {
      seen.push(f);
      return null;
    },
    () => false,
    () => null,
    () => null,
    () => focus,
  );
  assert.deepEqual(seen, [focus]);
  watcher.stop();
});

test("el temporizador reconcilia el foco; check() a mano no", async () => {
  let reconciled = 0;
  const watcher = startPetStateWatcher({
    focus: () => ({ kind: "auto" }),
    lastKnownStateEvent: () => null,
    liveSessionCandidates: () => [],
    sessionSlots: { get: () => [], set: () => {} },
    startedAt: STARTED_AT,
    getCachedFatigue: () => 0,
    getCachedExhausted: () => false,
    getCachedMedia: () => null,
    readCommitHash: () => null,
    broadcast: () => 0,
    reconcileFocus: () => {
      reconciled++;
    },
    intervalMs: 10,
  });

  watcher.check();
  assert.equal(reconciled, 0);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.ok(reconciled >= 1);
  watcher.stop();
});

test("othersActive: broadcastea cuando solo cambia el número de otras sesiones, y no si no cambia", () => {
  const event: LastKnownStateEvent = {
    hook: "Stop",
    toolName: null,
    derivedState: "resting",
    ts: "2026-01-01T00:00:00.000Z",
    project: null,
    stateEnteredAt: "2026-01-01T00:00:00.000Z",
  };
  const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s));
  let others: LiveSessionCandidate[] = [];
  const { watcher, broadcasts } = makeWatcher(
    () => event,
    () => false,
    () => null,
    () => null,
    () => ({ kind: "worktree", worktree: "/r-1" }),
    () => others,
  );
  watcher.check(at(1));
  assert.equal(broadcasts.at(-1)?.othersActive, 0);
  const n = broadcasts.length;

  watcher.check(at(2));
  assert.equal(broadcasts.length, n, "sin cambios no emite");

  others = [
    {
      sessionId: "B",
      lastEventAt: at(1).toISOString(),
      ended: false,
      repoRoot: "/r",
      worktree: "/r-2",
      startedAt: at(1).toISOString(),
      startedByClear: false,
      clearedEnd: false,
    },
  ];
  watcher.check(at(3));
  assert.equal(broadcasts.length, n + 1);
  assert.equal(broadcasts.at(-1)?.othersActive, 1);
  assert.equal(broadcasts.at(-1)?.state, "resting", "el estado no se toca");

  others = [{ ...(others[0] as LiveSessionCandidate), ended: true }];
  watcher.check(at(4));
  assert.equal(broadcasts.length, n + 2);
  assert.equal(broadcasts.at(-1)?.othersActive, 0);
  watcher.stop();
});

test("con all emite cuando cambia el estado de cualquier sesión, entra o sale una, y no si nada cambia", () => {
  const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s));
  const states: Record<string, string> = { A: "coding", B: "coding" };
  let sessions = ["A", "B"];
  const event = (sessionId: string): LastKnownStateEvent => ({
    hook: "PreToolUse",
    toolName: null,
    derivedState: states[sessionId] as string,
    ts: at(1).toISOString(),
    project: null,
    stateEnteredAt: at(1).toISOString(),
  });
  const { watcher, broadcasts } = makeWatcher(
    (focus) => (focus.kind === "session" ? event(focus.sessionId) : null),
    () => false,
    () => null,
    () => null,
    () => ({ kind: "all" }),
    () =>
      sessions.map((sessionId) => ({
        sessionId,
        lastEventAt: at(1).toISOString(),
        ended: false,
        repoRoot: "/r",
        worktree: `/r-${sessionId}`,
        startedAt: at(0).toISOString(),
        startedByClear: false,
        clearedEnd: false,
      })),
  );
  watcher.check(at(2));
  const n = broadcasts.length;
  watcher.check(at(3));
  assert.equal(broadcasts.length, n, "sin cambios no emite");

  states.A = "waiting";
  watcher.check(at(4));
  assert.equal(broadcasts.length, n + 1);
  assert.deepEqual(
    broadcasts.at(-1)?.sessions?.map((s) => [s.sessionId, s.state]),
    [
      ["A", "waiting"],
      ["B", "coding"],
    ],
  );

  sessions = ["A", "B", "C"];
  states.C = "coding";
  watcher.check(at(5));
  assert.equal(broadcasts.length, n + 2);

  sessions = ["A", "C"];
  watcher.check(at(6));
  assert.equal(broadcasts.length, n + 3);
  watcher.stop();
});
