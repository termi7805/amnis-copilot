import type { PetSnapshot, PetState } from "@amnis/shared";
import {
  commitHashFrom,
  type LastKnownStateEvent,
  petPhaseFrom,
} from "../application/getState.ts";

export interface PetStateWatcherDeps {
  lastKnownStateEvent(): LastKnownStateEvent | null;
  startedAt: string;
  getCachedFatigue(): number;
  /** Hermano exacto de `getCachedFatigue`: cuota agotada, cacheada del
   * último poll — un `state` disparado por hooks no debe pagar el poll. */
  getCachedExhausted(): boolean;
  /** `HEAD` corto del repo — solo se llama en `pushing` (commitHashFrom). */
  readCommitHash(project: string): string | null;
  broadcast(snapshot: PetSnapshot): void;
  intervalMs?: number;
}

export interface PetStateWatcher {
  /** Dirigido por evento: llamar justo después de insertar un hook event. */
  check(now?: Date): void;
  stop(): void;
}

/**
 * Solo dispara `broadcast` cuando cambia el campo `state`, no el
 * `PetSnapshot` entero — `since` avanza con cada evento del mismo estado,
 * y comparar el objeto completo emitiría un evento por cada hook.
 *
 * Cubre dos caminos: `check()` a mano (cero latencia, la razón de ser de
 * SSE) y un temporizador — el único que puede detectar `sleeping`, que no
 * lo dispara ningún evento.
 */
export function startPetStateWatcher(
  deps: PetStateWatcherDeps,
): PetStateWatcher {
  let lastBroadcastState: PetState | null = null;

  function check(now: Date = new Date()): void {
    const lastEvent = deps.lastKnownStateEvent();
    const phase = petPhaseFrom(
      lastEvent,
      deps.startedAt,
      now,
      deps.getCachedExhausted(),
    );
    if (phase.state === lastBroadcastState) return;
    lastBroadcastState = phase.state;
    deps.broadcast({
      ...phase,
      fatigue: deps.getCachedFatigue(),
      level: 1,
      commitHash: commitHashFrom(phase, lastEvent, deps.readCommitHash),
    });
  }

  check();
  const timer = setInterval(() => check(), deps.intervalMs ?? 30_000);
  timer.unref();

  return {
    check,
    stop: () => clearInterval(timer),
  };
}
