import assert from "node:assert/strict";
import { test } from "node:test";
import type { PetSnapshot } from "@amnis/shared";
import type { LastKnownStateEvent } from "../src/application/getState.ts";
import { startPetStateWatcher } from "../src/infrastructure/petStateWatcher.ts";

const STARTED_AT = "2026-01-01T00:00:00.000Z";

function makeWatcher(
  lastEvent: () => LastKnownStateEvent | null,
  getCachedExhausted: () => boolean = () => false,
) {
  const broadcasts: PetSnapshot[] = [];
  const watcher = startPetStateWatcher({
    lastKnownStateEvent: lastEvent,
    startedAt: STARTED_AT,
    getCachedFatigue: () => 0.5,
    getCachedExhausted,
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
