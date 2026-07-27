/**
 * Tipos compartidos entre el daemon y sus clientes (dashboard, mascota).
 * La mascota renderiza `PetSnapshot` sin saber de dónde sale.
 */

export type PetState =
  | "coding"
  | "testing"
  | "researching"
  | "planning"
  | "waiting"
  | "resting"
  | "sleeping";

export type ProviderId = "anthropic";

/** Lo único que el componente `<Pet>` necesita saber. Nada de sprites aquí. */
export interface PetSnapshot {
  state: PetState;
  /** ISO8601: desde cuándo está en este estado. */
  since: string;
  /** 0-1. Fatiga = consumo de la ventana de 5h. */
  fatigue: number;
  /** Fase 2. Siempre 1 en el MVP. */
  level: number;
  /** Qué evento produjo este estado, para depurar. */
  reason: string;
}

export interface QuotaWindow {
  utilization: number;
  resetsAt: string | null;
}

/**
 * Las dos vías se calculan siempre en paralelo, no solo como fallback:
 * su divergencia dice cuánto se consume fuera de Claude Code.
 */
export interface QuotaSnapshot {
  /** Lista indexada por proveedor: una fila más el día que exista Antigravity,
   * no un cambio de contrato (mismo criterio que account_id). */
  provider: ProviderId;
  /** Del endpoint OAuth. `null` si no respondió. */
  authoritative: {
    fiveHour: QuotaWindow;
    sevenDay: QuotaWindow;
    sevenDayOpus: QuotaWindow | null;
  } | null;
  /** Reconstruida de los JSONL locales. Siempre presente. */
  local: {
    fiveHourTokens: number;
    fiveHourUtilization: number;
    windowStartedAt: string;
  };
  /** authoritative.fiveHour - local.fiveHour. `null` si no hay endpoint. */
  divergence: number | null;
  sampledAt: string;
  error: string | null;
}

export interface StateResponse {
  pet: PetSnapshot;
  quotas: QuotaSnapshot[];
  daemon: {
    version: string;
    startedAt: string;
    eventsReceived: number;
    usageEvents: number;
  };
}

/** Evento de hook ya normalizado por el `Provider`. */
export interface NormalizedHookEvent {
  provider: ProviderId;
  hook: string;
  toolName: string | null;
  sessionId: string | null;
  project: string | null;
  permissionMode: string | null;
  command: string | null;
  at: string;
}
