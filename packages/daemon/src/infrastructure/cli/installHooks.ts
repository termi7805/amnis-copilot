import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { AMNIS_DIR, CLAUDE_SETTINGS, RESOURCES } from "../../config.ts";

/** Marca de identidad: cualquier hook cuyo `command` contenga esto es de Amnis. */
export const IDENTITY_MARK = "amnis-hook";

interface HookCommand {
  type: "command";
  command: string;
  timeout?: number;
}

export interface HookMatcher {
  matcher?: string;
  hooks: HookCommand[];
}

/** Forma parcial de settings.json: solo lo que install-hooks toca. Cualquier
 * otra clave o hook ya presente pasa intacto por `...`, sin importar quién
 * lo haya puesto ahí. */
export interface ClaudeSettings {
  hooks?: Record<string, HookMatcher[]>;
  [key: string]: unknown;
}

export interface HookEntry {
  event: string;
  matcher?: string;
  command: string;
}

/** Tolerante a entradas mal formadas: cualquier otra herramienta pudo haber
 * dejado el fichero en una forma inesperada, y eso no debe tumbar el merge.
 * Compartido con uninstall-hooks (#21) y doctor (#35): reconocer lo propio
 * es el mismo criterio en los tres sitios. */
export function isAmnisMatcher(m: HookMatcher): boolean {
  return (
    Array.isArray(m?.hooks) &&
    m.hooks.some(
      (h) =>
        typeof h?.command === "string" && h.command.includes(IDENTITY_MARK),
    )
  );
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

/** Cualquier JSON que no sea un objeto (array, primitivo, null, o fichero
 * inexistente/corrupto) se trata como "sin configuración previa", nunca
 * como un error que bloquee la instalación. */
export function readSettings(path: string): ClaudeSettings {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    return parsed as ClaudeSettings;
  } catch {
    return {};
  }
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

export function runInstallHooksCli(): void {
  const command = `/bin/sh '${RESOURCES.hookScript}'`;
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
