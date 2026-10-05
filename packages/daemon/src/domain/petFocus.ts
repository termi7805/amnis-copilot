import type { PetFocus } from "@amnis/shared";

/**
 * Cómo está la sesión enfocada. `cleared` es el hueco entre el `SessionEnd`
 * de un `/clear` y el `SessionStart` de la conversación nueva: llegan con
 * milisegundos de diferencia, y si el temporizador cayera en medio, con un
 * booleano `alive` soltaría el foco antes de poder seguirla.
 */
export type SessionStatus = "alive" | "cleared" | "ended";

export interface FocusFacts {
  session: SessionStatus;
  worktreeExists: boolean;
}

/** Lo que `focusAfter` necesita de un hook de sesión: el `worktree` ya
 * resuelto, que `NormalizedHookEvent` no lleva. */
export interface FocusEvent {
  hook: string;
  sessionId: string | null;
  sessionReason: string | null;
  worktree: string | null;
}

/**
 * El foco tras un hook de sesión (`event`) o tras el paso del tiempo
 * (`event: null`). La mascota no se queda mirando algo que ya no existe:
 *
 * - sesión: termina con su `SessionEnd` o por inactividad; un `/clear` la
 *   sigue en la conversación nueva (otro `session_id`, mismo worktree);
 * - worktree: termina cuando su directorio desaparece;
 * - repo y all: no terminan nunca.
 */
export function focusAfter(
  focus: PetFocus,
  event: FocusEvent | null,
  facts: FocusFacts,
): PetFocus {
  if (focus.kind === "worktree") {
    return facts.worktreeExists ? focus : { kind: "auto" };
  }
  if (focus.kind === "auto" || focus.kind === "all" || focus.kind === "repo") {
    return focus;
  }

  // Solo el traspaso desde una sesión que acaba de hacer `/clear`: el
  // `/clear` de otra sesión del mismo worktree no debe robar el foco.
  if (
    event?.hook === "SessionStart" &&
    event.sessionReason === "clear" &&
    event.sessionId &&
    event.sessionId !== focus.sessionId &&
    event.worktree === focus.worktree &&
    facts.session === "cleared"
  ) {
    return {
      kind: "session",
      sessionId: event.sessionId,
      worktree: focus.worktree,
    };
  }
  return facts.session === "ended" ? { kind: "auto" } : focus;
}
