import assert from "node:assert/strict";
import { test } from "node:test";
import type { NormalizedHookEvent } from "@amnis/shared";
import {
  derivePetState,
  SLEEP_AFTER_MS,
  sleepAfter,
} from "../src/domain/petState.ts";

function makeEvent(
  overrides: Partial<NormalizedHookEvent> = {},
): NormalizedHookEvent {
  return {
    provider: "anthropic",
    hook: "PreToolUse",
    toolName: null,
    sessionId: null,
    project: null,
    permissionMode: null,
    command: null,
    sessionReason: null,
    at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("PreToolUse con Edit/Write/NotebookEdit → coding", () => {
  for (const toolName of ["Edit", "Write", "NotebookEdit"]) {
    const result = derivePetState(makeEvent({ toolName }));
    assert.equal(result?.state, "coding");
  }
});

test("PreToolUse con Bash y un comando de test → testing", () => {
  for (const command of [
    "npm test",
    "pytest -k foo",
    "cargo test",
    "vitest run",
  ]) {
    const result = derivePetState(makeEvent({ toolName: "Bash", command }));
    assert.equal(result?.state, "testing");
  }
});

test("PreToolUse con Bash y un comando que no es de test → terminal", () => {
  const result = derivePetState(
    makeEvent({ toolName: "Bash", command: "ls -la" }),
  );
  assert.equal(result?.state, "terminal");
});

test("PreToolUse con Task o Agent → subagents", () => {
  for (const toolName of ["Task", "Agent"]) {
    const result = derivePetState(makeEvent({ toolName }));
    assert.equal(result?.state, "subagents");
  }
});

test("PreToolUse con Bash y git commit → committing", () => {
  const result = derivePetState(
    makeEvent({ toolName: "Bash", command: 'git commit -m "fix"' }),
  );
  assert.equal(result?.state, "committing");
});

test("PreToolUse con Bash y git push → pushing", () => {
  const result = derivePetState(
    makeEvent({ toolName: "Bash", command: "git push origin main" }),
  );
  assert.equal(result?.state, "pushing");
});

test("git commit con 'test' en el mensaje → committing, no testing", () => {
  const result = derivePetState(
    makeEvent({ toolName: "Bash", command: 'git commit -m "arregla el test"' }),
  );
  assert.equal(result?.state, "committing");
});

test("PreToolUse con Read/Grep/Glob/WebSearch/WebFetch → researching", () => {
  for (const toolName of ["Read", "Grep", "Glob", "WebSearch", "WebFetch"]) {
    const result = derivePetState(makeEvent({ toolName }));
    assert.equal(result?.state, "researching");
  }
});

test("ExitPlanMode/EnterPlanMode → planning", () => {
  for (const hook of ["ExitPlanMode", "EnterPlanMode"]) {
    const result = derivePetState(makeEvent({ hook, toolName: null }));
    assert.equal(result?.state, "planning");
  }
});

test("permissionMode plan gana a researching, aunque llegue un PreToolUse de Read", () => {
  const result = derivePetState(
    makeEvent({ toolName: "Read", permissionMode: "plan" }),
  );
  assert.equal(result?.state, "planning");
});

test("Notification → waiting", () => {
  const result = derivePetState(
    makeEvent({ hook: "Notification", toolName: null }),
  );
  assert.equal(result?.state, "waiting");
});

test("Stop → resting", () => {
  const result = derivePetState(makeEvent({ hook: "Stop", toolName: null }));
  assert.equal(result?.state, "resting");
});

test("un hook desconocido no mapea a ningún estado", () => {
  const result = derivePetState(
    makeEvent({ hook: "UserPromptSubmit", toolName: null }),
  );
  assert.equal(result, null);
});

test("PreToolUse sin toolName no lanza y no mapea", () => {
  const result = derivePetState(makeEvent({ toolName: null }));
  assert.equal(result, null);
});

test("cada estado devuelto trae un reason legible", () => {
  const result = derivePetState(makeEvent({ toolName: "Edit" }));
  assert.ok(result?.reason.includes("Edit"));
});

test("sleepAfter: sin lastEventAt, siempre true (estado inicial al arrancar)", () => {
  assert.equal(sleepAfter(null, new Date("2026-01-01T00:00:00.000Z")), true);
});

test("sleepAfter: evento reciente, false", () => {
  const lastEventAt = new Date("2026-01-01T00:00:00.000Z");
  const now = new Date(lastEventAt.getTime() + 1000);
  assert.equal(sleepAfter(lastEventAt, now), false);
});

test("sleepAfter: evento a más de 10 min, true", () => {
  const lastEventAt = new Date("2026-01-01T00:00:00.000Z");
  const now = new Date(lastEventAt.getTime() + SLEEP_AFTER_MS + 1);
  assert.equal(sleepAfter(lastEventAt, now), true);
});

test("sleepAfter: justo en el límite, true", () => {
  const lastEventAt = new Date("2026-01-01T00:00:00.000Z");
  const now = new Date(lastEventAt.getTime() + SLEEP_AFTER_MS);
  assert.equal(sleepAfter(lastEventAt, now), true);
});

test("SessionStart y SessionEnd no son actividad, ni siquiera en plan mode", () => {
  for (const hook of ["SessionStart", "SessionEnd"]) {
    assert.equal(derivePetState(makeEvent({ hook })), null);
    assert.equal(
      derivePetState(makeEvent({ hook, permissionMode: "plan" })),
      null,
    );
  }
});
