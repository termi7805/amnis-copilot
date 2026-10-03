import { CLAUDE_SETTINGS } from "../../config.ts";
import {
  type ClaudeSettings,
  isAmnisMatcher,
  readSettings,
} from "../claudeSettings.ts";
import { backupSettings, writeSettingsAtomic } from "./installHooks.ts";

/**
 * Espejo de `mergeHooks`: quita **exactamente** las entradas de Amnis y deja
 * todo lo demás intacto. Pura, sin I/O.
 *
 * "Equivalente al original", no solo "parecido": si un evento se queda sin
 * matchers tras quitar los de Amnis, se borra la clave del evento en vez de
 * dejar un array vacío huérfano. Recorre todos los eventos presentes, no
 * solo los tres que install-hooks instala hoy — una versión anterior pudo
 * haber registrado otro.
 */
export function removeHooks(settings: ClaudeSettings): ClaudeSettings {
  const existingHooks =
    settings.hooks &&
    typeof settings.hooks === "object" &&
    !Array.isArray(settings.hooks)
      ? settings.hooks
      : null;

  if (!existingHooks) return settings;

  const hooks: ClaudeSettings["hooks"] = {};
  for (const [event, matchers] of Object.entries(existingHooks)) {
    if (!Array.isArray(matchers)) {
      hooks[event] = matchers;
      continue;
    }
    const withoutAmnis = matchers.filter((m) => !isAmnisMatcher(m));
    if (withoutAmnis.length > 0) hooks[event] = withoutAmnis;
  }

  if (Object.keys(hooks).length === 0) {
    const { hooks: _discarded, ...rest } = settings;
    return rest;
  }
  return { ...settings, hooks };
}

export function runUninstallHooksCli(): void {
  const backupPath = backupSettings(CLAUDE_SETTINGS);
  const current = readSettings(CLAUDE_SETTINGS);
  const cleaned = removeHooks(current);
  writeSettingsAtomic(CLAUDE_SETTINGS, cleaned);

  if (backupPath) console.log(`Respaldo: ${backupPath}`);
  console.log(`Hooks de Amnis eliminados de ${CLAUDE_SETTINGS}.`);
}
