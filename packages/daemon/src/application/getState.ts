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

function fatigueFrom(quotas: readonly QuotaSnapshot[]): number {
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
 * `GET /api/state` (#26): rebanada vertical del proyecto. `since` es una
 * aproximación barata — el ts del último evento con estado reconocible, o
 * `startedAt` si nunca hubo ninguno — no "cuánto llevas exactamente en
 * este estado". `reason` se reconstruye desde `hook`/`toolName` porque
 * `hook_events` no guarda el texto libre de `DerivedState.reason` (#23).
 */
export async function getState(
  deps: GetStateDeps,
  now: Date,
): Promise<StateResponse> {
  const lastEvent = deps.lastKnownStateEvent();
  const lastEventAt = lastEvent ? new Date(lastEvent.ts) : null;
  const asleep = sleepAfter(lastEventAt, now);

  const state: PetState = asleep
    ? "sleeping"
    : (lastEvent?.derivedState as PetState);
  const since = lastEventAt?.toISOString() ?? deps.startedAt;
  const reason = lastEvent
    ? `${lastEvent.hook}${lastEvent.toolName ? ` ${lastEvent.toolName}` : ""}`
    : "sin eventos";

  const quotas = await deps.sampleQuotas();

  return {
    pet: {
      state,
      since,
      fatigue: fatigueFrom(quotas),
      level: 1,
      reason,
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
