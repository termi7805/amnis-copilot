import type { NormalizedHookEvent, PetState } from "@amnis/shared";

/** Comandos de Bash que cuentan como "correr tests". */
const TEST_COMMAND = /\btest\b|\bpytest\b|\bjest\b|\bvitest\b|cargo test/;

const CODING_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);
const RESEARCH_TOOLS = new Set([
  "Read",
  "Grep",
  "Glob",
  "WebSearch",
  "WebFetch",
]);
const PLAN_MODE_HOOKS = new Set(["ExitPlanMode", "EnterPlanMode"]);

export interface DerivedState {
  state: PetState;
  /** Qué produjo esta transición, para depurar (`PetSnapshot.reason`). */
  reason: string;
}

/**
 * Un evento entra, un estado sale — o `null` si el evento no mapea a
 * ninguno de la tabla. Un hook desconocido no debe inventar una
 * transición: se descarta, nunca lanza.
 *
 * `sleeping` no vive aquí: es un estado por *ausencia* de eventos
 * (temporizador de inactividad, #24), no una transición que un evento
 * concreto dispare.
 */
export function derivePetState(
  event: NormalizedHookEvent,
): DerivedState | null {
  // Va primero porque es transversal: en plan mode también llegan
  // PreToolUse de Read, y si ganase `researching` el modo plan sería
  // invisible en la mascota.
  if (event.permissionMode === "plan" || PLAN_MODE_HOOKS.has(event.hook)) {
    return { state: "planning", reason: `${event.hook} en modo plan` };
  }

  if (event.hook === "PreToolUse") {
    const tool = event.toolName;
    if (tool && CODING_TOOLS.has(tool)) {
      return { state: "coding", reason: `PreToolUse ${tool}` };
    }
    if (tool === "Bash" && event.command && TEST_COMMAND.test(event.command)) {
      return { state: "testing", reason: `PreToolUse Bash: ${event.command}` };
    }
    if (tool && RESEARCH_TOOLS.has(tool)) {
      return { state: "researching", reason: `PreToolUse ${tool}` };
    }
    return null;
  }

  if (event.hook === "Notification") {
    return { state: "waiting", reason: "Notification" };
  }

  if (event.hook === "Stop") {
    return { state: "resting", reason: "Stop" };
  }

  return null;
}
