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
import type {
  ClaudeSettings,
  RepairHooksDeps,
} from "../application/installHooks.ts";
import {
  AMNIS_DIR,
  CLAUDE_SETTINGS,
  INSTALLED_HOOK_SCRIPT,
  RESOURCES,
} from "../config.ts";

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

/** Copia el script a ~/.amnis/hooks en vez de apuntar a él donde esté:
 * settings.json necesita una ruta que no cambie, y ni la del repo (se puede
 * mover) ni la de los recursos de la app (una AppImage se monta en una ruta
 * distinta en cada arranque) lo garantizan. Reinstalar la sobrescribe. */
export function installHookScript(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  chmodSync(to, 0o755);
}

/** Las dependencias reales de `repairHooks`: el CLI y la ruta HTTP usan estas. */
export function makeRepairHooksDeps(): RepairHooksDeps {
  return {
    installScript: () =>
      installHookScript(RESOURCES.hookScript, INSTALLED_HOOK_SCRIPT),
    command: `/bin/sh '${INSTALLED_HOOK_SCRIPT}'`,
    read: () => readSettings(CLAUDE_SETTINGS),
    backup: () => backupSettings(CLAUDE_SETTINGS),
    write: (settings) => writeSettingsAtomic(CLAUDE_SETTINGS, settings),
  };
}
