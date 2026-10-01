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
  | "sleeping"
  | "terminal"
  | "subagents"
  | "committing"
  | "pushing"
  | "limited";

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
  /** Short hash de `HEAD` en el momento de `pushing` — `null` en
   * cualquier otro estado, o si no se pudo leer (fuera de un repo git). */
  commitHash: string | null;
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

/**
 * `not-configured` (sin Client ID) y `not-logged-in` (con Client ID, sin
 * sesión) se distinguen porque la UI pide cosas distintas: copiar un comando
 * o pulsar "Conectar". Solo el daemon sabe cuál de las dos es.
 */
export type MediaStatus =
  | "ok"
  | "no-device"
  | "not-logged-in"
  | "not-configured"
  | "unavailable";

export interface MediaTrack {
  id: string;
  title: string;
  artists: string[];
  album: string;
  imageUrl: string | null;
  durationMs: number;
}

export interface MediaDevice {
  id: string | null;
  name: string;
  type: string;
}

/** Un dispositivo Spotify Connect de `GET /api/media/devices`. */
export interface MediaDeviceOption extends MediaDevice {
  isActive: boolean;
}

/**
 * Qué suena. Vive en memoria y viaja por SSE: nada de Spotify se persiste.
 * `progressMs` se midió en `measuredAt`; el cliente interpola el avance.
 */
export interface MediaSnapshot {
  status: MediaStatus;
  isPlaying: boolean;
  /** `null` salvo con `status: "ok"`, y aun así en un anuncio. */
  track: MediaTrack | null;
  progressMs: number;
  /** ISO8601. */
  measuredAt: string;
  shuffle: boolean;
  repeat: "off" | "context" | "track";
  device: MediaDevice | null;
}

export interface StateResponse {
  pet: PetSnapshot;
  quotas: QuotaSnapshot[];
  media: MediaSnapshot;
  daemon: {
    version: string;
    startedAt: string;
    eventsReceived: number;
    usageEvents: number;
  };
}

/**
 * Contrato de `GET /api/events` (SSE). Se declara una vez aquí porque hay
 * tres consumidores (mascota, su panel de cuota, dashboard) — si cada uno
 * lo improvisa, divergen (docs/STACK.md §4).
 */
export type AmnisEvent =
  | { event: "hello"; data: StateResponse }
  | { event: "state"; data: PetSnapshot }
  | { event: "quota"; data: QuotaSnapshot[] }
  | { event: "media"; data: MediaSnapshot };

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
