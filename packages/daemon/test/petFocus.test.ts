import assert from "node:assert/strict";
import { test } from "node:test";
import type { PetFocus } from "@amnis/shared";
import {
  type FocusEvent,
  type FocusFacts,
  focusAfter,
} from "../src/domain/petFocus.ts";

const FOCUS: PetFocus = { kind: "session", sessionId: "a", worktree: "/r/wt" };
const ALIVE: FocusFacts = { session: "alive", worktreeExists: true };

function start(overrides: Partial<FocusEvent> = {}): FocusEvent {
  return {
    hook: "SessionStart",
    sessionId: "b",
    sessionReason: "clear",
    worktree: "/r/wt",
    ...overrides,
  };
}

test("auto y repo no terminan nunca", () => {
  const dead: FocusFacts = { session: "ended", worktreeExists: false };
  for (const focus of [
    { kind: "auto" },
    { kind: "repo", repoRoot: "/r" },
  ] as PetFocus[]) {
    assert.deepEqual(focusAfter(focus, null, dead), focus);
  }
});

test("un worktree termina cuando su directorio ya no existe", () => {
  const focus: PetFocus = { kind: "worktree", worktree: "/r/wt" };
  assert.deepEqual(focusAfter(focus, null, ALIVE), focus);
  assert.deepEqual(
    focusAfter(focus, null, { ...ALIVE, worktreeExists: false }),
    { kind: "auto" },
  );
});

test("una sesión terminada devuelve el foco a auto; viva, no", () => {
  assert.deepEqual(focusAfter(FOCUS, null, ALIVE), FOCUS);
  assert.deepEqual(focusAfter(FOCUS, null, { ...ALIVE, session: "ended" }), {
    kind: "auto",
  });
});

test("tras un /clear el foco pasa a la sesión nueva del mismo worktree", () => {
  const next = focusAfter(FOCUS, start(), { ...ALIVE, session: "cleared" });
  assert.deepEqual(next, {
    kind: "session",
    sessionId: "b",
    worktree: "/r/wt",
  });
});

test("entre el SessionEnd(clear) y el SessionStart(clear) el foco espera", () => {
  assert.deepEqual(
    focusAfter(FOCUS, null, { ...ALIVE, session: "cleared" }),
    FOCUS,
  );
});

test("el /clear de otra sesión no roba el foco a una sesión viva", () => {
  assert.deepEqual(focusAfter(FOCUS, start(), ALIVE), FOCUS);
});

test("un SessionStart(clear) de otro worktree no mueve el foco", () => {
  const facts: FocusFacts = { ...ALIVE, session: "cleared" };
  assert.deepEqual(
    focusAfter(FOCUS, start({ worktree: "/otro" }), facts),
    FOCUS,
  );
});

test("un SessionStart que no es de un clear no hace el traspaso", () => {
  const facts: FocusFacts = { ...ALIVE, session: "cleared" };
  assert.deepEqual(
    focusAfter(FOCUS, start({ sessionReason: "startup" }), facts),
    FOCUS,
  );
});

test("un SessionEnd de la sesión enfocada la suelta", () => {
  const end = start({
    hook: "SessionEnd",
    sessionId: "a",
    sessionReason: "prompt_input_exit",
  });
  assert.deepEqual(focusAfter(FOCUS, end, { ...ALIVE, session: "ended" }), {
    kind: "auto",
  });
});
