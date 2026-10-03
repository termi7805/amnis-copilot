/**
 * Instalar/reparar los hooks de Amnis en el `settings.json` de Claude Code
 * (#90). Lo comparten `amnis install-hooks` y `POST /api/hooks/install`, que
 * son hermanos (STACK §7): ninguno importa del otro, los dos llaman aquí.
 * El acceso al fichero entra como dependencias.
 */

/** Marca de identidad: cualquier hook cuyo `command` contenga esto es de Amnis. */
export const IDENTITY_MARK = "amnis-hook";

/** Los eventos que Amnis registra. `doctor` y `/api/health` comprueban estos. */
export const EXPECTED_HOOK_EVENTS: readonly string[] = [
  "PreToolUse",
  "Notification",
  "Stop",
];

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

/** Las entradas que Amnis registra, apuntando todas al mismo script. */
export function amnisHookEntries(command: string): HookEntry[] {
  return EXPECTED_HOOK_EVENTS.map((event) => ({
    event,
    matcher: event === "PreToolUse" ? "*" : undefined,
    command,
  }));
}

/**
 * Merge no destructivo: sustituye las entradas de Amnis **en su sitio**,
 * deja todo lo demás (cualquier otro hook ya instalado, otros eventos,
 * claves de nivel superior) intacto, sea cual sea el entorno en el que corra.
 * Pura, sin I/O.
 *
 * En su sitio, no "quitar y añadir al final": si el hook de otra herramienta
 * va detrás del de Amnis, reparar no debe reordenarlos — el diff contra la
 * copia de seguridad ha de mostrar solo lo que de verdad faltaba. Por lo
 * mismo, reinstalar sobre algo ya correcto no cambia nada.
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
    const pending = eventEntries.map(
      (entry): HookMatcher => ({
        matcher: entry.matcher,
        hooks: [{ type: "command", command: entry.command, timeout: 10 }],
      }),
    );

    const merged: HookMatcher[] = [];
    for (const m of existing) {
      if (!isAmnisMatcher(m)) {
        merged.push(m);
        continue;
      }
      // Cada matcher de Amnis ocupa el lugar del anterior; los que sobran
      // (duplicados de una versión antigua) se descartan.
      const next = pending.shift();
      if (next) merged.push(next);
    }
    hooks[event] = [...merged, ...pending];
  }

  return { ...settings, hooks };
}

/** Eventos esperados donde todavía no hay ningún matcher de Amnis. */
export function missingHookEvents(settings: ClaudeSettings): string[] {
  const hooks =
    settings.hooks &&
    typeof settings.hooks === "object" &&
    !Array.isArray(settings.hooks)
      ? settings.hooks
      : {};
  return EXPECTED_HOOK_EVENTS.filter((event) => {
    const matchers = hooks[event];
    return !(Array.isArray(matchers) && matchers.some(isAmnisMatcher));
  });
}

export interface RepairHooksDeps {
  /** Copia el script a su ruta estable antes de registrarlo. */
  installScript(): void;
  /** Comando que settings.json invoca (apunta al script instalado). */
  command: string;
  read(): ClaudeSettings;
  /** Copia de seguridad del settings.json actual; `null` si no existía. */
  backup(): string | null;
  write(settings: ClaudeSettings): void;
}

export interface RepairHooksResult {
  /** Eventos que no tenían hook de Amnis y ahora sí. */
  added: string[];
  /** Ruta de la copia de seguridad; `null` si no se escribió nada. */
  backup: string | null;
}

/**
 * Deja instalados los hooks de Amnis. Si el resultado es idéntico a lo que
 * había, no escribe ni hace copia: cada clic en "Reparar" no debe acumular
 * ficheros en `~/.amnis`. Si cambia algo: copia de seguridad antes y
 * escritura atómica (la implementa quien inyecta `write`).
 */
export function repairHooks(deps: RepairHooksDeps): RepairHooksResult {
  deps.installScript();
  const current = deps.read();
  const added = missingHookEvents(current);
  const merged = mergeHooks(current, amnisHookEntries(deps.command));

  if (JSON.stringify(merged) === JSON.stringify(current)) {
    return { added, backup: null };
  }
  const backup = deps.backup();
  deps.write(merged);
  return { added, backup };
}
