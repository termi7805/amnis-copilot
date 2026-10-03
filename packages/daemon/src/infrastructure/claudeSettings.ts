import { readFileSync } from "node:fs";

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
