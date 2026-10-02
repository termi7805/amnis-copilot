import type {
  Listening,
  MediaSnapshot,
  PetSnapshot,
  PetState,
} from "@amnis/shared";
import {
  commitHashFrom,
  type LastKnownStateEvent,
  petPhaseFrom,
} from "../application/getState.ts";
import {
  deriveListening,
  LISTENING_GRACE_MS,
  type ListeningMemory,
  NO_LISTENING,
} from "../domain/listening.ts";

export interface PetStateWatcherDeps {
  lastKnownStateEvent(): LastKnownStateEvent | null;
  startedAt: string;
  getCachedFatigue(): number;
  /** Hermano exacto de `getCachedFatigue`: cuota agotada, cacheada del
   * último poll — un `state` disparado por hooks no debe pagar el poll. */
  getCachedExhausted(): boolean;
  /** Último `media` leído, sin pagar una lectura de Spotify (`listening`). */
  getCachedMedia(): MediaSnapshot | null;
  /** `HEAD` corto del repo — solo se llama en `pushing` (commitHashFrom). */
  readCommitHash(project: string): string | null;
  broadcast(snapshot: PetSnapshot): void;
  intervalMs?: number;
}

export interface PetStateWatcher {
  /** Dirigido por evento: llamar justo después de insertar un hook event. */
  check(now?: Date): void;
  /** El eje `listening` tal como lo vio el último `check()`. */
  listening(): Listening | null;
  stop(): void;
}

/**
 * Solo dispara `broadcast` cuando cambia el campo `state` o el eje
 * `listening` (#59), no el `PetSnapshot` entero — `since` avanza con cada
 * evento del mismo estado, y comparar el objeto completo emitiría un evento
 * por cada hook. `listening` nunca altera `state`: ni lo despierta de
 * `sleeping` ni lo cambia.
 *
 * Cubre dos caminos: `check()` a mano (cero latencia, la razón de ser de
 * SSE) y un temporizador — el único que puede detectar `sleeping`, que no
 * lo dispara ningún evento.
 */
export function startPetStateWatcher(
  deps: PetStateWatcherDeps,
): PetStateWatcher {
  let lastBroadcastState: PetState | null = null;
  let lastBroadcastListening: string | null = null;
  let lastBroadcastProject: string | null = null;
  let memory: ListeningMemory = NO_LISTENING;
  // El apagado de `listening` no lo dispara ningún evento: sin esto llegaría
  // con el intervalo de 30 s, no a los ~15 s de la pausa.
  let graceTimer: NodeJS.Timeout | null = null;

  function check(now: Date = new Date()): void {
    const lastEvent = deps.lastKnownStateEvent();
    const phase = petPhaseFrom(
      lastEvent,
      deps.startedAt,
      now,
      deps.getCachedExhausted(),
    );
    memory = deriveListening(memory, deps.getCachedMedia(), now);
    scheduleGrace(now);
    const listeningKey = JSON.stringify(memory.listening);
    if (
      phase.state === lastBroadcastState &&
      phase.project === lastBroadcastProject &&
      listeningKey === lastBroadcastListening
    ) {
      return;
    }
    lastBroadcastState = phase.state;
    lastBroadcastListening = listeningKey;
    lastBroadcastProject = phase.project;
    deps.broadcast({
      ...phase,
      fatigue: deps.getCachedFatigue(),
      level: 1,
      commitHash: commitHashFrom(phase, lastEvent, deps.readCommitHash),
      listening: memory.listening,
    });
  }

  function scheduleGrace(now: Date): void {
    if (graceTimer) clearTimeout(graceTimer);
    graceTimer = null;
    if (memory.playing || !memory.listening || memory.heardAt === null) return;
    const delay = Math.max(
      0,
      memory.heardAt + LISTENING_GRACE_MS - now.getTime(),
    );
    graceTimer = setTimeout(() => check(), delay + 50);
    graceTimer.unref();
  }

  check();
  const timer = setInterval(() => check(), deps.intervalMs ?? 30_000);
  timer.unref();

  return {
    check,
    listening: () => memory.listening,
    stop: () => {
      clearInterval(timer);
      if (graceTimer) clearTimeout(graceTimer);
    },
  };
}
