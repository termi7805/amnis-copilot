import assert from "node:assert/strict";
import { test } from "node:test";
import type { NormalizedHookEvent } from "@amnis/shared";
import { derivePetState } from "../src/domain/petState.ts";

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

test("PreToolUse con Bash y un comando que no es de test → null", () => {
  const result = derivePetState(
    makeEvent({ toolName: "Bash", command: "ls -la" }),
  );
  assert.equal(result, null);
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
