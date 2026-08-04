import type { NormalizedHookEvent, PetState } from "@amnis/shared";

/** Comandos de Bash que cuentan como "correr tests". */
const TEST_COMMAND = /\btest\b|\bpytest\b|\bjest\b|\bvitest\b|cargo test/;
const GIT_PUSH_COMMAND = /\bgit\s+push\b/;
const GIT_COMMIT_COMMAND = /\bgit\s+commit\b/;

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
    // "Task" es el nombre documentado de Claude Code; "Agent" es el que
    // de verdad llega en este harness (comprobado en hook_events) — se
    // cubren los dos por si el nombre cambia según entorno/versión.
    if (tool === "Task" || tool === "Agent") {
      return { state: "subagents", reason: `PreToolUse ${tool}` };
    }
    // Los dos `git` van antes de TEST_COMMAND: un `git commit -m "arregla
    // el test"` matchea /\btest\b/ y caería en `testing` si no.
    if (
      tool === "Bash" &&
      event.command &&
      GIT_PUSH_COMMAND.test(event.command)
    ) {
      return { state: "pushing", reason: `PreToolUse Bash: ${event.command}` };
    }
    if (
      tool === "Bash" &&
      event.command &&
      GIT_COMMIT_COMMAND.test(event.command)
    ) {
      return {
        state: "committing",
        reason: `PreToolUse Bash: ${event.command}`,
      };
    }
    if (tool === "Bash" && event.command && TEST_COMMAND.test(event.command)) {
      return { state: "testing", reason: `PreToolUse Bash: ${event.command}` };
    }
    if (tool === "Bash") {
      return {
        state: "terminal",
        reason: `PreToolUse Bash: ${event.command ?? ""}`,
      };
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

/** Duplica config.ts SLEEP_AFTER_MS a propósito: domain/ no importa nada del
 * proyecto (mismo patrón que FIVE_HOUR_MS en localQuota.ts). */
export const SLEEP_AFTER_MS = 10 * 60_000;

/**
 * `lastEventAt: null` → true: nunca hubo evento, y no saber qué haces no es
 * lo mismo que saber que estás trabajando — arrancar en `coding` sería
 * inventarse un dato, así que `sleeping` es el estado inicial al arrancar.
 */
export function sleepAfter(lastEventAt: Date | null, now: Date): boolean {
  if (!lastEventAt) return true;
  return now.getTime() - lastEventAt.getTime() >= SLEEP_AFTER_MS;
}
