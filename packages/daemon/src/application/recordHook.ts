import type { NormalizedHookEvent, PetState } from "@amnis/shared";

export interface HookEventInput {
  provider: string;
  ts: string;
  hook: string;
  toolName: string | null;
  sessionId: string | null;
  project: string | null;
  sessionReason: string | null;
  /** `null` si el evento no trae `cwd`: no hay de dónde resolverlos. */
  repoRoot: string | null;
  worktree: string | null;
  derivedState: string;
}

/**
 * Todo lo que `recordHook` necesita de fuera. `normalizeHookEvent` viene del
 * `Provider` (Anthropic hoy); `deriveState` es la máquina de estados de
 * `domain/petState.ts` (#23), inyectada para que este caso de uso y la ruta
 * HTTP no sepan de dominio. `null` cuando el evento no dispara transición.
 */
export interface RecordHookDeps {
  normalizeHookEvent(raw: unknown): NormalizedHookEvent | null;
  deriveState(event: NormalizedHookEvent): PetState | null;
  /** Repo y worktree de un `cwd`; con caché, no lanza `git` cada vez. */
  resolveCheckout(cwd: string): { repoRoot: string; worktree: string };
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

  const checkout = event.project ? deps.resolveCheckout(event.project) : null;

  deps.insertHookEvent({
    provider: event.provider,
    ts: event.at,
    hook: event.hook,
    toolName: event.toolName,
    sessionId: event.sessionId,
    project: event.project,
    sessionReason: event.sessionReason,
    repoRoot: checkout?.repoRoot ?? null,
    worktree: checkout?.worktree ?? null,
    derivedState: deps.deriveState(event) ?? "unknown",
  });

  return event;
}
