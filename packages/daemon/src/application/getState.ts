import type { PetState, QuotaSnapshot, StateResponse } from "@amnis/shared";
import { sleepAfter } from "../domain/petState.ts";

export interface LastKnownStateEvent {
  hook: string;
  toolName: string | null;
  derivedState: string;
  ts: string;
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
 * `since` es una aproximación barata — el ts del último evento con estado
 * reconocible, o `startedAt` si nunca hubo ninguno — no "cuánto llevas
 * exactamente en este estado". `reason` se reconstruye desde
 * `hook`/`toolName` porque `hook_events` no guarda el texto libre de
 * `DerivedState.reason` (#23).
 */
export function petPhaseFrom(
  lastEvent: LastKnownStateEvent | null,
  startedAt: string,
  now: Date,
): PetPhase {
  const lastEventAt = lastEvent ? new Date(lastEvent.ts) : null;
  const asleep = sleepAfter(lastEventAt, now);

  const state: PetState = asleep
    ? "sleeping"
    : (lastEvent?.derivedState as PetState);
  const since = lastEventAt?.toISOString() ?? startedAt;
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

/** `GET /api/state` (#26): rebanada vertical del proyecto. */
export async function getState(
  deps: GetStateDeps,
  now: Date,
): Promise<StateResponse> {
  const phase = petPhaseFrom(deps.lastKnownStateEvent(), deps.startedAt, now);
  const quotas = await deps.sampleQuotas();

  return {
    pet: {
      ...phase,
      fatigue: fatigueFrom(quotas),
      level: 1,
    },
    quotas,
    daemon: {
      version: deps.version,
      startedAt: deps.startedAt,
      eventsReceived: deps.countHookEvents(),
      usageEvents: deps.countUsageEvents(),
    },
  };
}
