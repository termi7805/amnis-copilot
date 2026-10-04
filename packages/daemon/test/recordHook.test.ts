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
    resolveCheckout: (cwd) => ({ repoRoot: cwd, worktree: cwd }),
    focus: () => ({ kind: "auto" }),
    focusFacts: () => ({ session: "alive", worktreeExists: true }),
    setFocus: () => {},
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

test("repoRoot y worktree salen de resolveCheckout con el cwd del evento", () => {
  const calls: string[] = [];
  const { deps, inserted } = makeDeps({
    normalizeHookEvent: () => ({
      provider: "anthropic",
      hook: "PreToolUse",
      toolName: null,
      sessionId: "s1",
      project: "/r/wt/sub",
      permissionMode: null,
      command: null,
      sessionReason: null,
      at: "2026-01-01T00:00:00.000Z",
    }),
    resolveCheckout: (cwd) => {
      calls.push(cwd);
      return { repoRoot: "/r", worktree: "/r/wt" };
    },
  });

  recordHook(deps, { hook_event_name: "PreToolUse" });

  assert.deepEqual(calls, ["/r/wt/sub"]);
  assert.equal(inserted[0]?.repoRoot, "/r");
  assert.equal(inserted[0]?.worktree, "/r/wt");
});

test("sin cwd no se resuelve nada y las dos claves van a null", () => {
  const { deps, inserted } = makeDeps({
    resolveCheckout: () => {
      throw new Error("no debería llamarse");
    },
  });

  recordHook(deps, { hook_event_name: "Stop" });

  assert.equal(inserted[0]?.repoRoot, null);
  assert.equal(inserted[0]?.worktree, null);
});

test("un SessionEnd de la sesión enfocada devuelve el foco a auto", () => {
  const calls: unknown[] = [];
  const { deps } = makeDeps({
    normalizeHookEvent: () => ({
      provider: "anthropic",
      hook: "SessionEnd",
      toolName: null,
      sessionId: "a",
      project: "/r/wt",
      permissionMode: null,
      command: null,
      sessionReason: "prompt_input_exit",
      at: "2026-01-01T00:00:00.000Z",
    }),
    focus: () => ({ kind: "session", sessionId: "a", worktree: "/r/wt" }),
    focusFacts: () => ({ session: "ended", worktreeExists: true }),
    setFocus: (f) => calls.push(f),
  });

  recordHook(deps, { hook_event_name: "SessionEnd" });

  assert.deepEqual(calls, [{ kind: "auto" }]);
});

test("un PreToolUse no evalúa el foco, y si no cambia no se guarda nada", () => {
  const evaluated: string[] = [];
  const base = {
    focus: () => ({ kind: "auto" }) as const,
    focusFacts: () => {
      evaluated.push("facts");
      return { session: "alive", worktreeExists: true } as const;
    },
    setFocus: () => evaluated.push("set"),
  };
  recordHook(makeDeps(base).deps, { hook_event_name: "PreToolUse" });
  assert.deepEqual(evaluated, []);

  recordHook(makeDeps(base).deps, { hook_event_name: "SessionStart" });
  assert.deepEqual(evaluated, ["facts"]);
});
