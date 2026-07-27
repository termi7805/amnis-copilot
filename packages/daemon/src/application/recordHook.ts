import type { NormalizedHookEvent } from "@amnis/shared";

export interface HookEventInput {
  provider: string;
  ts: string;
  hook: string;
  toolName: string | null;
  sessionId: string | null;
  project: string | null;
  derivedState: string;
}

/**
 * Todo lo que `recordHook` necesita de fuera. `normalizeHookEvent` viene del
 * `Provider` (Anthropic hoy); `deriveState` es la costura hacia la máquina
 * de estados de #23 — hasta que exista, el llamador inyecta una función que
 * devuelve un estado fijo, sin que este caso de uso ni la ruta HTTP lo sepan.
 */
export interface RecordHookDeps {
  normalizeHookEvent(raw: unknown): NormalizedHookEvent | null;
  deriveState(event: NormalizedHookEvent): string;
  insertHookEvent(event: HookEventInput): void;
}

/**
 * Normaliza y persiste un evento de hook. `null` si el payload no era
 * normalizable — se descarta, nunca lanza: un evento raro no puede tumbar
 * al servidor que ya respondió 200 antes de llegar aquí.
 */
export function recordHook(
  deps: RecordHookDeps,
  raw: unknown,
): NormalizedHookEvent | null {
  const event = deps.normalizeHookEvent(raw);
  if (!event) return null;

  deps.insertHookEvent({
    provider: event.provider,
    ts: event.at,
    hook: event.hook,
    toolName: event.toolName,
    sessionId: event.sessionId,
    project: event.project,
    derivedState: deps.deriveState(event),
  });

  return event;
}
