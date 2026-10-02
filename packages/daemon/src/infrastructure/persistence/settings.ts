import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_MUSIC_PREFS, type MusicPrefs } from "@amnis/shared";
import { SETTINGS_PATH } from "../../config.ts";
import { sanitizeMusicPrefs } from "../../domain/musicPrefs.ts";

/**
 * Lee las preferencias. Un fichero ausente, ilegible o corrupto da los valores
 * por defecto y nunca lanza: tus ajustes no pueden impedir que el daemon
 * arranque. Con campos sueltos inválidos se conservan los buenos.
 */
export function readSettings(path: string = SETTINGS_PATH): MusicPrefs {
  try {
    return sanitizeMusicPrefs(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return { ...DEFAULT_MUSIC_PREFS };
  }
}

/**
 * Escribe a un temporal y renombra: un corte a mitad no deja un JSON roto
 * donde estaban los ajustes buenos.
 */
export function writeSettings(
  prefs: MusicPrefs,
  path: string = SETTINGS_PATH,
): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(prefs, null, 2)}\n`);
  renameSync(tmp, path);
}
