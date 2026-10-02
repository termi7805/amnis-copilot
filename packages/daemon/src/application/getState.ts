import type {
  Listening,
  MediaSnapshot,
  PetState,
  QuotaSnapshot,
  StateResponse,
} from "@amnis/shared";
import { sleepAfter } from "../domain/petState.ts";

export interface LastKnownStateEvent {
  hook: string;
  toolName: string | null;
  derivedState: string;
  ts: string;
  /** `cwd` del hook que produjo este estado — de dónde leer `HEAD` para
   * el hash real en `pushing` (#47). */
  project: string | null;
  /** `ts` del primer evento de la racha actual en `derivedState` — lo que
   * alimenta `since` (ver `petPhaseFrom`). `ts` en sí sigue siendo el del
   * último evento, y es lo que usa `sleepAfter` para detectar inactividad. */
  stateEnteredAt: string;
}

/**
 * Todo lo que `getState` necesita de fuera. Como `sampleQuota.ts` y
 * `recordHook.ts`: nada de `config.ts` ni `node:sqlite` aquí.
 */
export interface GetStateDeps {
  version: string;
  /** ISO8601, capturado una vez al arrancar el daemon. */
  startedAt: string;
  lastKnownStateEvent(): LastKnownStateEvent | null;
  countHookEvents(): number;
  countUsageEvents(): number;
  /** Uno por proveedor, ya con `.provider` puesto (quotaSampler.ts). */
  sampleQuotas(): Promise<QuotaSnapshot[]>;
  /** Qué suena ahora; nunca rechaza (degrada a `status: "unavailable"`). */
  media(): Promise<MediaSnapshot>;
  /** El eje `listening` ya derivado (petStateWatcher.ts). */
  listening(): Listening | null;
  /** `HEAD` corto del repo en `project` — solo se llama en `pushing`
   * (infrastructure/git.ts). */
  readCommitHash(project: string): string | null;
}

export interface PetPhase {
  state: PetState;
  since: string;
  reason: string;
}

/**
 * Todo lo que determina `state`/`since`/`reason` sin tocar la cuota —
 * separado de `getState()` porque `petStateWatcher.ts` (#28) necesita esta
 * misma lógica para disparar un evento SSE sin pagar el poll de cuota que
 * `getState()` sí hace en cada llamada.
 *
 * `since` es `stateEnteredAt` (racha actual en el mismo estado), no `ts`
 * (último evento cualquiera) — un `PreToolUse` por herramienta reiniciaría
 * "cuánto llevas programando" en cada `Edit` si usara `ts`. La detección
 * de inactividad (`sleepAfter`) sí usa `ts`: un estado que lleva rato
 * activo no debe parecer "reciente" a efectos de dormir. `reason` se
 * reconstruye desde `hook`/`toolName` porque `hook_events` no guarda el
 * texto libre de `DerivedState.reason` (#23).
 */
/**
 * `exhausted` gana a todo, incluido `sleeping`: "estás parado" y "estás
 * parado porque no te queda cuota" no son la misma información, y la
 * segunda explica la primera. Se limpia sola en el reset de la ventana.
 */
export function petPhaseFrom(
  lastEvent: LastKnownStateEvent | null,
  startedAt: string,
  now: Date,
  exhausted = false,
): PetPhase {
  if (exhausted) {
    return {
      state: "limited",
      since: lastEvent?.stateEnteredAt ?? startedAt,
      reason: "cuota de 5 h agotada",
    };
  }

  const lastEventAt = lastEvent ? new Date(lastEvent.ts) : null;
  const asleep = sleepAfter(lastEventAt, now);

  const state: PetState = asleep
    ? "sleeping"
    : (lastEvent?.derivedState as PetState);
  const since = lastEvent?.stateEnteredAt ?? startedAt;
  const reason = lastEvent
    ? `${lastEvent.hook}${lastEvent.toolName ? ` ${lastEvent.toolName}` : ""}`
    : "sin eventos";

  return { state, since, reason };
}

export function fatigueFrom(quotas: readonly QuotaSnapshot[]): number {
  const primary = quotas[0];
  if (!primary) return 0;
  const utilization =
    primary.authoritative?.fiveHour.utilization ??
    primary.local.fiveHourUtilization;
  // Clamp solo para la barra de fatiga de la mascota: el QuotaSnapshot
  // crudo se queda sin clamp (estimate() en domain/localQuota.ts documenta
  // por qué por encima de 100 es señal real, no ruido a esconder).
  return Math.min(1, Math.max(0, utilization / 100));
}

/**
 * Solo la fuente autoritativa dispara `limited` — la estimación local es
 * una estimación, y por debajo de 100% de verdad puede leer 100% de
 * ruido (docs/DESIGN.md). Sin `authoritative`, nunca hay `limited`.
 */
export function quotaExhausted(quotas: readonly QuotaSnapshot[]): boolean {
  const primary = quotas[0];
  if (!primary?.authoritative) return false;
  return primary.authoritative.fiveHour.utilization >= 100;
}

/**
 * Solo `pushing` cablea un hash real: en `PreToolUse` el commit al que
 * apunta ya existe (es el paso anterior), así que `HEAD` en ese instante
 * es el que se está subiendo. En `committing`, `HEAD` todavía es el
 * commit *anterior* — mostrarlo sería inventar un dato, así que no se
 * llama a `readCommitHash` en ningún otro estado.
 */
export function commitHashFrom(
  phase: PetPhase,
  lastEvent: LastKnownStateEvent | null,
  readCommitHash: (project: string) => string | null,
): string | null {
  if (phase.state !== "pushing" || !lastEvent?.project) return null;
  return readCommitHash(lastEvent.project);
}

/** `GET /api/state` (#26): rebanada vertical del proyecto. */
export async function getState(
  deps: GetStateDeps,
  now: Date,
): Promise<StateResponse> {
  const [quotas, media] = await Promise.all([
    deps.sampleQuotas(),
    deps.media(),
  ]);
  const lastEvent = deps.lastKnownStateEvent();
  const phase = petPhaseFrom(
    lastEvent,
    deps.startedAt,
    now,
    quotaExhausted(quotas),
  );

  return {
    pet: {
      ...phase,
      fatigue: fatigueFrom(quotas),
      level: 1,
      commitHash: commitHashFrom(phase, lastEvent, deps.readCommitHash),
      listening: deps.listening(),
    },
    quotas,
    media,
    daemon: {
      version: deps.version,
      startedAt: deps.startedAt,
      eventsReceived: deps.countHookEvents(),
      usageEvents: deps.countUsageEvents(),
    },
  };
}
