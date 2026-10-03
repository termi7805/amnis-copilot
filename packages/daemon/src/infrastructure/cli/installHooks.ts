import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  AMNIS_DIR,
  CLAUDE_SETTINGS,
  INSTALLED_HOOK_SCRIPT,
  RESOURCES,
} from "../../config.ts";
import {
  type ClaudeSettings,
  type HookMatcher,
  isAmnisMatcher,
  readSettings,
} from "../claudeSettings.ts";

export interface HookEntry {
  event: string;
  matcher?: string;
  command: string;
}

/**
 * Merge no destructivo: reemplaza las entradas de Amnis en su sitio, deja
 * todo lo demás (cualquier otro hook ya instalado, otros eventos, claves de
 * nivel superior) intacto, sea cual sea el entorno en el que corra.
 * Pura, sin I/O: reinstalar dos veces produce el mismo resultado.
 */
export function mergeHooks(
  settings: ClaudeSettings,
  entries: readonly HookEntry[],
): ClaudeSettings {
  const existingHooks =
    settings.hooks &&
    typeof settings.hooks === "object" &&
    !Array.isArray(settings.hooks)
      ? settings.hooks
      : {};
  const hooks: Record<string, HookMatcher[]> = { ...existingHooks };

  const byEvent = new Map<string, HookEntry[]>();
  for (const entry of entries) {
    const list = byEvent.get(entry.event) ?? [];
    list.push(entry);
    byEvent.set(entry.event, list);
  }

  for (const [event, eventEntries] of byEvent) {
    const existingRaw = hooks[event];
    const existing = Array.isArray(existingRaw) ? existingRaw : [];
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

export function backupSettings(path: string): string | null {
  if (!existsSync(path)) return null;
  const backupPath = join(AMNIS_DIR, `settings.backup.${Date.now()}.json`);
  mkdirSync(AMNIS_DIR, { recursive: true });
  writeFileSync(backupPath, readFileSync(path));
  return backupPath;
}

/** Escritura atómica: tmp + rename, para no dejar el settings.json de otra
 * aplicación a medio escribir si el proceso muere a mitad de camino. */
export function writeSettingsAtomic(
  path: string,
  settings: ClaudeSettings,
): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${path}.amnis-tmp-${process.pid}`;
  writeFileSync(tmpPath, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(tmpPath, path);
}

/** Copia el script a ~/.amnis/hooks en vez de apuntar a él donde esté:
 * settings.json necesita una ruta que no cambie, y ni la del repo (se puede
 * mover) ni la de los recursos de la app (una AppImage se monta en una ruta
 * distinta en cada arranque) lo garantizan. Reinstalar la sobrescribe. */
export function installHookScript(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  chmodSync(to, 0o755);
}

export function runInstallHooksCli(): void {
  installHookScript(RESOURCES.hookScript, INSTALLED_HOOK_SCRIPT);
  const command = `/bin/sh '${INSTALLED_HOOK_SCRIPT}'`;
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
