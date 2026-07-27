import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ClaudeSettings,
  type HookEntry,
  mergeHooks,
} from "../src/infrastructure/cli/installHooks.ts";

const ORCA_COMMAND =
  "if [ -f '/home/termi/.orca/agent-hooks/claude-hook.sh' ]; then /bin/sh '/home/termi/.orca/agent-hooks/claude-hook.sh'; fi";

const AMNIS_ENTRIES: HookEntry[] = [
  { event: "PreToolUse", matcher: "*", command: "/bin/sh '/x/amnis-hook.sh'" },
  { event: "Notification", command: "/bin/sh '/x/amnis-hook.sh'" },
  { event: "Stop", command: "/bin/sh '/x/amnis-hook.sh'" },
];

test("instalar sobre una configuración con Orca deja las dos conviviendo", () => {
  const settings: ClaudeSettings = {
    model: "opusplan",
    hooks: {
      PreToolUse: [
        { matcher: "*", hooks: [{ type: "command", command: ORCA_COMMAND }] },
      ],
      Stop: [{ hooks: [{ type: "command", command: ORCA_COMMAND }] }],
    },
  };

  const merged = mergeHooks(settings, AMNIS_ENTRIES);

  assert.equal(merged.model, "opusplan");
  const preToolUse = merged.hooks?.PreToolUse ?? [];
  assert.equal(preToolUse.length, 2);
  assert.ok(preToolUse.some((m) => m.hooks[0]?.command === ORCA_COMMAND));
  assert.ok(preToolUse.some((m) => m.hooks[0]?.command.includes("amnis-hook")));

  const stop = merged.hooks?.Stop ?? [];
  assert.equal(stop.length, 2);

  const notification = merged.hooks?.Notification ?? [];
  assert.equal(notification.length, 1);
  assert.ok(notification[0]?.hooks[0]?.command.includes("amnis-hook"));
});

test("reinstalar dos veces no duplica entradas", () => {
  const settings: ClaudeSettings = { hooks: {} };

  const once = mergeHooks(settings, AMNIS_ENTRIES);
  const twice = mergeHooks(once, AMNIS_ENTRIES);

  assert.equal(twice.hooks?.PreToolUse?.length, 1);
  assert.equal(twice.hooks?.Notification?.length, 1);
  assert.equal(twice.hooks?.Stop?.length, 1);
});

test("las claves ajenas y los eventos donde solo vive Orca sobreviven", () => {
  const settings: ClaudeSettings = {
    attribution: { commit: "" },
    model: "opusplan",
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: "command", command: ORCA_COMMAND }] },
      ],
    },
  };

  const merged = mergeHooks(settings, AMNIS_ENTRIES);

  assert.deepEqual(merged.attribution, { commit: "" });
  assert.equal(merged.model, "opusplan");
  assert.equal(merged.hooks?.UserPromptSubmit?.length, 1);
  assert.equal(
    merged.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.command,
    ORCA_COMMAND,
  );
});

test("un settings.json vacío se crea desde cero con solo los hooks de Amnis", () => {
  const merged = mergeHooks({}, AMNIS_ENTRIES);

  assert.equal(merged.hooks?.PreToolUse?.length, 1);
  assert.equal(merged.hooks?.Notification?.length, 1);
  assert.equal(merged.hooks?.Stop?.length, 1);
});
