import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  amnisHookEntries,
  type ClaudeSettings,
  EXPECTED_HOOK_EVENTS,
  type HookEntry,
  hookCommand,
  mergeHooks,
  missingHookEvents,
  type RepairHooksDeps,
  repairHooks,
} from "../src/application/installHooks.ts";

const ORCA_COMMAND =
  "if [ -f '/home/x/.otra-app/hooks/claude-hook.sh' ]; then /bin/sh '/home/x/.otra-app/hooks/claude-hook.sh'; fi";

const AMNIS_ENTRIES: HookEntry[] = [
  { event: "PreToolUse", matcher: "*", command: "/bin/sh '/x/amnis-hook.sh'" },
  { event: "Notification", command: "/bin/sh '/x/amnis-hook.sh'" },
  { event: "Stop", command: "/bin/sh '/x/amnis-hook.sh'" },
  { event: "SessionStart", command: "/bin/sh '/x/amnis-hook.sh'" },
  { event: "SessionEnd", command: "/bin/sh '/x/amnis-hook.sh'" },
];

/** Lo que instalaba Amnis antes de #105. */
const LEGACY_ENTRIES = AMNIS_ENTRIES.slice(0, 3);

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
    assert.equal(commands.length, EXPECTED_HOOK_EVENTS.length);
    for (const command of commands) {
      assert.equal(command, `/bin/sh '${installed}'`);
    }
  } finally {
    rmSync(claudeDir, { recursive: true, force: true });
    rmSync(amnisDir, { recursive: true, force: true });
  }
});

const AMNIS_COMMAND = "/bin/sh '/x/amnis-hook.sh'";

/** Deps en memoria: `writes` y `backups` cuentan qué tocó `repairHooks`. */
function fakeRepairDeps(initial: ClaudeSettings) {
  const state = {
    settings: initial,
    writes: 0,
    backups: 0,
    scripts: 0,
  };
  const deps: RepairHooksDeps = {
    installScript: () => {
      state.scripts++;
    },
    command: AMNIS_COMMAND,
    read: () => state.settings,
    backup: () => {
      state.backups++;
      return "/x/settings.backup.1.json";
    },
    write: (next) => {
      state.writes++;
      state.settings = next;
    },
  };
  return { state, deps };
}

test("mergeHooks sustituye la entrada de Amnis en su sitio y no reordena a Orca", () => {
  const settings: ClaudeSettings = {
    hooks: {
      Stop: [
        { hooks: [{ type: "command", command: AMNIS_COMMAND }] },
        { hooks: [{ type: "command", command: ORCA_COMMAND }] },
      ],
    },
  };

  const merged = mergeHooks(settings, AMNIS_ENTRIES);

  const stop = merged.hooks?.Stop ?? [];
  assert.equal(stop.length, 2);
  assert.ok(stop[0]?.hooks[0]?.command.includes("amnis-hook"));
  assert.equal(stop[1]?.hooks[0]?.command, ORCA_COMMAND);
});

test("repairHooks sin la entrada Notification solo añade esa, con copia de seguridad", () => {
  const complete = mergeHooks(
    {
      model: "opusplan",
      hooks: {
        Notification: [{ hooks: [{ type: "command", command: ORCA_COMMAND }] }],
      },
    },
    AMNIS_ENTRIES,
  );
  const broken: ClaudeSettings = {
    ...complete,
    hooks: {
      ...complete.hooks,
      Notification: (complete.hooks?.Notification ?? []).filter(
        (m) => !m.hooks[0]?.command.includes("amnis-hook"),
      ),
    },
  };
  const { state, deps } = fakeRepairDeps(broken);

  const result = repairHooks(deps);

  assert.deepEqual(result.added, ["Notification"]);
  assert.equal(result.backup, "/x/settings.backup.1.json");
  assert.equal(state.writes, 1);
  assert.deepEqual(state.settings, complete);
});

test("repairHooks con todo instalado no escribe ni hace copia", () => {
  const { state, deps } = fakeRepairDeps(mergeHooks({}, AMNIS_ENTRIES));

  const result = repairHooks(deps);

  assert.deepEqual(result, { added: [], backup: null });
  assert.equal(state.writes, 0);
  assert.equal(state.backups, 0);
  assert.equal(state.scripts, 1);
});

test("repairHooks sobre un settings.json vacío instala todos los eventos", () => {
  const { state, deps } = fakeRepairDeps({});

  const result = repairHooks(deps);

  assert.deepEqual(result.added, [...EXPECTED_HOOK_EVENTS]);
  assert.equal(state.writes, 1);
});

test("SessionStart y SessionEnd se esperan y se registran sin matcher", () => {
  const entries = amnisHookEntries("/bin/sh '/x/amnis-hook.sh'");
  for (const event of ["SessionStart", "SessionEnd"]) {
    assert.ok(EXPECTED_HOOK_EVENTS.includes(event));
    const entry = entries.find((e) => e.event === event);
    assert.ok(entry);
    assert.equal(entry.matcher, undefined);
  }
});

test("una instalación anterior (solo PreToolUse, Notification, Stop) pide los hooks de sesión y repair los añade", () => {
  const old = mergeHooks({}, LEGACY_ENTRIES);
  assert.deepEqual(missingHookEvents(old), ["SessionStart", "SessionEnd"]);

  const { state, deps } = fakeRepairDeps(old);
  const result = repairHooks(deps);

  assert.deepEqual(result.added, ["SessionStart", "SessionEnd"]);
  assert.equal(state.writes, 1);
  assert.deepEqual(missingHookEvents(state.settings), []);
});

test("hookCommand: en Windows la ruta del script va con / para que sh la entienda", () => {
  assert.equal(
    hookCommand("/home/x/.amnis/hooks/amnis-hook.sh", "linux"),
    "/bin/sh '/home/x/.amnis/hooks/amnis-hook.sh'",
  );
  assert.equal(
    hookCommand("C:\\Users\\x\\.amnis\\hooks\\amnis-hook.sh", "win32"),
    "/bin/sh 'C:/Users/x/.amnis/hooks/amnis-hook.sh'",
  );
});
