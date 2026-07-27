import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ClaudeSettings,
  type HookEntry,
  mergeHooks,
} from "../src/infrastructure/cli/installHooks.ts";
import { removeHooks } from "../src/infrastructure/cli/uninstallHooks.ts";

const ORCA_COMMAND =
  "if [ -f '/home/termi/.orca/agent-hooks/claude-hook.sh' ]; then /bin/sh '/home/termi/.orca/agent-hooks/claude-hook.sh'; fi";

const AMNIS_ENTRIES: HookEntry[] = [
  { event: "PreToolUse", matcher: "*", command: "/bin/sh '/x/amnis-hook.sh'" },
  { event: "Notification", command: "/bin/sh '/x/amnis-hook.sh'" },
  { event: "Stop", command: "/bin/sh '/x/amnis-hook.sh'" },
];

test("instalar y desinstalar sobre una configuración con Orca deja settings.json equivalente al original", () => {
  const original: ClaudeSettings = {
    model: "opusplan",
    hooks: {
      PreToolUse: [
        { matcher: "*", hooks: [{ type: "command", command: ORCA_COMMAND }] },
      ],
      Stop: [{ hooks: [{ type: "command", command: ORCA_COMMAND }] }],
    },
  };

  const installed = mergeHooks(original, AMNIS_ENTRIES);
  const uninstalled = removeHooks(installed);

  assert.deepEqual(uninstalled, original);
});

test("un evento donde solo vivía Amnis desaparece de la clave, no queda como array vacío", () => {
  const settings: ClaudeSettings = { hooks: {} };
  const installed = mergeHooks(settings, AMNIS_ENTRIES);

  const uninstalled = removeHooks(installed);

  assert.ok(!("Notification" in (uninstalled.hooks ?? {})));
  assert.ok(!("PreToolUse" in (uninstalled.hooks ?? {})));
  assert.ok(!("Stop" in (uninstalled.hooks ?? {})));
});

test("si hooks queda vacío tras desinstalar, la clave hooks se borra entera", () => {
  const settings: ClaudeSettings = { hooks: {} };
  const installed = mergeHooks(settings, AMNIS_ENTRIES);

  const uninstalled = removeHooks(installed);

  assert.ok(!("hooks" in uninstalled));
});

test("desinstalar sobre settings sin Amnis no cambia nada", () => {
  const settings: ClaudeSettings = {
    model: "opusplan",
    hooks: {
      PreToolUse: [
        { matcher: "*", hooks: [{ type: "command", command: ORCA_COMMAND }] },
      ],
    },
  };

  const uninstalled = removeHooks(settings);

  assert.deepEqual(uninstalled, settings);
});

test("las claves de nivel superior ajenas a hooks sobreviven", () => {
  const settings: ClaudeSettings = {
    attribution: { commit: "" },
    model: "opusplan",
    hooks: {
      PreToolUse: [
        { matcher: "*", hooks: [{ type: "command", command: ORCA_COMMAND }] },
      ],
    },
  };
  const installed = mergeHooks(settings, AMNIS_ENTRIES);

  const uninstalled = removeHooks(installed);

  assert.deepEqual(uninstalled.attribution, { commit: "" });
  assert.equal(uninstalled.model, "opusplan");
});

test("tolera un settings.hooks corrupto (no objeto) sin lanzar", () => {
  const settings = {
    hooks: "no-deberia-ser-un-string",
  } as unknown as ClaudeSettings;

  const uninstalled = removeHooks(settings);

  assert.deepEqual(uninstalled, settings);
});

test("tolera un evento existente que no es array (otra herramienta lo dejó mal) sin lanzar", () => {
  const settings = {
    hooks: { PreToolUse: "corrupto" },
  } as unknown as ClaudeSettings;

  const uninstalled = removeHooks(settings);

  assert.equal(uninstalled.hooks?.PreToolUse, "corrupto");
});

test("un settings.json sin hooks en absoluto se devuelve intacto", () => {
  const settings: ClaudeSettings = { model: "opusplan" };

  const uninstalled = removeHooks(settings);

  assert.deepEqual(uninstalled, settings);
});
