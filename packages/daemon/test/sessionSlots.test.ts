import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assignSlots,
  IDENTITY_COLORS,
  type SessionSlot,
  type SlotCandidate,
} from "../src/domain/sessionSlots.ts";

const NOW = new Date("2026-01-01T01:00:00.000Z");
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();

function cand(
  sessionId: string,
  startedMinutesAgo: number,
  overrides: Partial<SlotCandidate> = {},
): SlotCandidate {
  return {
    sessionId,
    worktree: `/w-${sessionId}`,
    startedAt: minutesAgo(startedMinutesAgo),
    lastEventAt: minutesAgo(1),
    ended: false,
    startedByClear: false,
    clearedEnd: false,
    ...overrides,
  };
}

const ids = (slots: readonly SessionSlot[]) => slots.map((s) => s.sessionId);
const identities = (slots: readonly SessionSlot[]) =>
  slots.map((s) => s.identity);

function cleared(sessionId: string, startedMinutesAgo: number, idleMin = 0.1) {
  return cand(sessionId, startedMinutesAgo, {
    ended: true,
    clearedEnd: true,
    lastEventAt: minutesAgo(idleMin),
  });
}

test("cada sesión nueva toma el primer color libre y van por orden de llegada", () => {
  const slots = assignSlots(
    [cand("B", 20), cand("A", 30), cand("C", 10)],
    [],
    NOW,
  );
  assert.deepEqual(ids(slots), ["A", "B", "C"]);
  assert.deepEqual(identities(slots), [0, 1, 2]);
});

test("una sesión conserva puesto y color aunque otra tenga más actividad reciente", () => {
  const first = assignSlots([cand("A", 30), cand("B", 20)], [], NOW);
  const next = assignSlots(
    [cand("A", 30, { lastEventAt: minutesAgo(8) }), cand("B", 20)],
    first,
    NOW,
  );
  assert.deepEqual(next, first);
});

test("al salir una sesión las demás no se mueven y la siguiente ocupa su hueco", () => {
  const first = assignSlots(
    [cand("A", 30), cand("B", 20), cand("C", 10)],
    [],
    NOW,
  );
  const after = assignSlots(
    [cand("A", 30), cand("B", 20, { ended: true }), cand("C", 10)],
    first,
    NOW,
  );
  assert.deepEqual(ids(after), ["A", "C"]);
  assert.deepEqual(identities(after), [0, 2]);

  const again = assignSlots(
    [cand("A", 30), cand("C", 10), cand("D", 1)],
    after,
    NOW,
  );
  assert.deepEqual(ids(again), ["A", "C", "D"]);
  assert.equal(again.find((s) => s.sessionId === "D")?.identity, 1);
});

test("una sesión inactiva más que la ventana sale", () => {
  const first = assignSlots([cand("A", 30)], [], NOW);
  assert.deepEqual(
    assignSlots([cand("A", 30, { lastEventAt: minutesAgo(11) })], first, NOW),
    [],
  );
});

test("/clear: la sesión nueva hereda puesto y color del mismo worktree", () => {
  const first = assignSlots([cand("A", 30), cand("B", 20)], [], NOW);

  const reserved = assignSlots([cleared("A", 30), cand("B", 20)], first, NOW);
  assert.deepEqual(
    reserved,
    first,
    "el puesto se reserva hasta que llega la nueva",
  );

  const after = assignSlots(
    [
      cleared("A", 30),
      cand("A2", 0.1, { worktree: "/w-A", startedByClear: true }),
      cand("B", 20),
    ],
    reserved,
    NOW,
  );
  assert.deepEqual(ids(after), ["A2", "B"]);
  assert.equal(after[0]?.identity, first[0]?.identity);
  assert.equal(after[0]?.rank, first[0]?.rank);
});

test("/clear en otro worktree no hereda", () => {
  const first = assignSlots([cand("A", 30)], [], NOW);
  const after = assignSlots(
    [
      cleared("A", 30),
      cand("X", 0.1, { worktree: "/otro", startedByClear: true }),
    ],
    first,
    NOW,
  );
  assert.equal(after.find((s) => s.sessionId === "X")?.identity, 1);
});

test("la reserva de un /clear caduca si la sesión nueva no llega", () => {
  const first = assignSlots([cand("A", 30)], [], NOW);
  assert.deepEqual(assignSlots([cleared("A", 30, 5)], first, NOW), []);
});

test("con la paleta llena se reparte el color menos usado", () => {
  const many = Array.from({ length: IDENTITY_COLORS + 1 }, (_, i) =>
    cand(`s${i}`, 60 - i),
  );
  const slots = assignSlots(many, [], NOW);
  assert.equal(slots.at(-1)?.identity, 0);
});

test("las sesiones sin worktree se ignoran", () => {
  assert.deepEqual(
    assignSlots([cand("A", 5, { worktree: null })], [], NOW),
    [],
  );
});
