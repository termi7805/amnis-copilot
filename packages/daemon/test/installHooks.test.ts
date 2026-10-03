import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ClaudeSettings } from "../src/infrastructure/claudeSettings.ts";
import {
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

test("tolera un settings.hooks corrupto (no objeto) sin lanzar", () => {
  const settings = {
    hooks: "no-deberia-ser-un-string",
  } as unknown as ClaudeSettings;

  const merged = mergeHooks(settings, AMNIS_ENTRIES);

  assert.equal(merged.hooks?.PreToolUse?.length, 1);
});

test("tolera un evento existente que no es array (otra herramienta lo dejó mal) sin lanzar", () => {
  const settings = {
    hooks: { PreToolUse: "corrupto" },
  } as unknown as ClaudeSettings;

  const merged = mergeHooks(settings, AMNIS_ENTRIES);

  assert.equal(merged.hooks?.PreToolUse?.length, 1);
});

test("funciona igual con cualquier otro hook de terceros ya instalado, no solo uno concreto", () => {
  const thirdPartyCommand = "/bin/sh '/opt/cualquier-otra-herramienta/hook.sh'";
  const settings: ClaudeSettings = {
    hooks: {
      PreToolUse: [
        {
          matcher: "*",
          hooks: [{ type: "command", command: thirdPartyCommand }],
        },
      ],
    },
  };

  const merged = mergeHooks(settings, AMNIS_ENTRIES);

  const preToolUse = merged.hooks?.PreToolUse ?? [];
  assert.equal(preToolUse.length, 2);
  assert.ok(preToolUse.some((m) => m.hooks[0]?.command === thirdPartyCommand));
  assert.ok(preToolUse.some((m) => m.hooks[0]?.command.includes("amnis-hook")));
});

test("amnis install-hooks copia el script a AMNIS_DIR/hooks y lo registra desde ahí", () => {
  const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
  const source = fileURLToPath(
    new URL("../hooks/amnis-hook.sh", import.meta.url),
  );
  const claudeDir = mkdtempSync(join(tmpdir(), "amnis-hooks-claude-"));
  const amnisDir = mkdtempSync(join(tmpdir(), "amnis-hooks-amnis-"));
  try {
    execFileSync("node", [cli, "install-hooks"], {
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: claudeDir,
        AMNIS_DIR: amnisDir,
      },
    });

    const installed = join(amnisDir, "hooks", "amnis-hook.sh");
    assert.equal(readFileSync(installed, "utf8"), readFileSync(source, "utf8"));
    assert.equal(statSync(installed).mode & 0o777, 0o755);

    const settings = JSON.parse(
      readFileSync(join(claudeDir, "settings.json"), "utf8"),
    ) as ClaudeSettings;
    const commands = Object.values(settings.hooks ?? {}).flatMap((ms) =>
      ms.flatMap((m) => m.hooks.map((h) => h.command)),
    );
    assert.equal(commands.length, 3);
    for (const command of commands) {
      assert.equal(command, `/bin/sh '${installed}'`);
    }
  } finally {
    rmSync(claudeDir, { recursive: true, force: true });
    rmSync(amnisDir, { recursive: true, force: true });
  }
});
