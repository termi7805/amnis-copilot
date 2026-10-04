import assert from "node:assert/strict";
import { test } from "node:test";
import type { NormalizedHookEvent } from "@amnis/shared";
import type {
  HookEventInput,
  RecordHookDeps,
} from "../src/application/recordHook.ts";
import { recordHook } from "../src/application/recordHook.ts";

function makeDeps(overrides: Partial<RecordHookDeps> = {}): {
  deps: RecordHookDeps;
  inserted: HookEventInput[];
} {
  const inserted: HookEventInput[] = [];
  const deps: RecordHookDeps = {
    normalizeHookEvent: (raw) => {
      const payload = raw as Record<string, unknown>;
      if (typeof payload?.hook_event_name !== "string") return null;
      return {
        provider: "anthropic",
        hook: payload.hook_event_name,
        toolName: null,
        sessionId: null,
        project: null,
        permissionMode: null,
        command: null,
        sessionReason: null,
        at: "2026-01-01T00:00:00.000Z",
      };
    },
    deriveState: () => null,
    insertHookEvent: (event) => inserted.push(event),
    ...overrides,
  };
  return { deps, inserted };
}

test("un payload válido se normaliza y persiste", () => {
  const { deps, inserted } = makeDeps();

  const result = recordHook(deps, {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
  });

  assert.ok(result);
  assert.equal(result.hook, "PreToolUse");
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0]?.hook, "PreToolUse");
  assert.equal(inserted[0]?.derivedState, "unknown");
});

test("un payload no normalizable se descarta sin insertar", () => {
  const { deps, inserted } = makeDeps();

  const result = recordHook(deps, { foo: "bar" });

  assert.equal(result, null);
  assert.equal(inserted.length, 0);
});

test("deriveState se llama con el evento normalizado, no con el payload crudo", () => {
  let received: NormalizedHookEvent | undefined;
  const { deps } = makeDeps({
    deriveState: (event) => {
      received = event;
      return "coding";
    },
  });

  recordHook(deps, { hook_event_name: "PreToolUse" });

  assert.equal(received?.hook, "PreToolUse");
});
