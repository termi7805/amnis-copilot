import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AMNIS_DIR, CLAUDE_SETTINGS } from "../../config.ts";

/** Marca de identidad: cualquier hook cuyo `command` contenga esto es de Amnis. */
const IDENTITY_MARK = "amnis-hook";

interface HookCommand {
  type: "command";
  command: string;
  timeout?: number;
}

interface HookMatcher {
  matcher?: string;
  hooks: HookCommand[];
}

/** Forma parcial de settings.json: solo lo que install-hooks toca. Todo lo
 * demás (claves de nivel superior, otros eventos) pasa intacto por `...`. */
export interface ClaudeSettings {
  hooks?: Record<string, HookMatcher[]>;
  [key: string]: unknown;
}

export interface HookEntry {
  event: string;
  matcher?: string;
  command: string;
}

function isAmnisMatcher(m: HookMatcher): boolean {
  return m.hooks.some((h) => h.command.includes(IDENTITY_MARK));
}

/**
 * Merge no destructivo: reemplaza las entradas de Amnis en su sitio, deja
 * todo lo demás (Orca, otros eventos, claves de nivel superior) intacto.
 * Pura, sin I/O: reinstalar dos veces produce el mismo resultado.
 */
export function mergeHooks(
  settings: ClaudeSettings,
  entries: readonly HookEntry[],
): ClaudeSettings {
  const hooks: Record<string, HookMatcher[]> = { ...settings.hooks };

  const byEvent = new Map<string, HookEntry[]>();
  for (const entry of entries) {
    const list = byEvent.get(entry.event) ?? [];
    list.push(entry);
    byEvent.set(entry.event, list);
  }

  for (const [event, eventEntries] of byEvent) {
    const existing = hooks[event] ?? [];
    const withoutAmnis = existing.filter((m) => !isAmnisMatcher(m));
    const amnisMatchers = eventEntries.map(
      (entry): HookMatcher => ({
        matcher: entry.matcher,
        hooks: [{ type: "command", command: entry.command, timeout: 10 }],
      }),
    );
    hooks[event] = [...withoutAmnis, ...amnisMatchers];
  }

  return { ...settings, hooks };
}

function hookScriptPath(): string {
  return fileURLToPath(
    new URL("../../../hooks/amnis-hook.sh", import.meta.url),
  );
}

function readSettings(path: string): ClaudeSettings {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ClaudeSettings;
  } catch {
    return {};
  }
}

function backupSettings(path: string): string | null {
  if (!existsSync(path)) return null;
  const backupPath = join(AMNIS_DIR, `settings.backup.${Date.now()}.json`);
  mkdirSync(AMNIS_DIR, { recursive: true });
  writeFileSync(backupPath, readFileSync(path));
  return backupPath;
}

/** Escritura atómica: tmp + rename, para no dejar el settings.json de otra
 * aplicación a medio escribir si el proceso muere a mitad de camino. */
function writeSettingsAtomic(path: string, settings: ClaudeSettings): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${path}.amnis-tmp-${process.pid}`;
  writeFileSync(tmpPath, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(tmpPath, path);
}

export function runInstallHooksCli(): void {
  const command = `/bin/sh '${hookScriptPath()}'`;
  const entries: HookEntry[] = [
    { event: "PreToolUse", matcher: "*", command },
    { event: "Notification", command },
    { event: "Stop", command },
  ];

  const backupPath = backupSettings(CLAUDE_SETTINGS);
  const current = readSettings(CLAUDE_SETTINGS);
  const merged = mergeHooks(current, entries);
  writeSettingsAtomic(CLAUDE_SETTINGS, merged);

  if (backupPath) console.log(`Respaldo: ${backupPath}`);
  console.log(
    `Hooks instalados en ${CLAUDE_SETTINGS}: PreToolUse, Notification, Stop.`,
  );
}
