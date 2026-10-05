import type { DaemonMessage } from "./messages.ts";

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
  /** Nombre (no la ruta) del proyecto del último evento de hook; `null` si
   * aún no ha habido ninguno o el hook no traía `cwd`. */
  project: string | null;
  /** Eje ortogonal al estado: qué suena. Lo deciden Spotify y ReccoBeats, no
   * los agentes; `null` tras ~15 s sin sonar. */
  listening: Listening | null;
  /** A qué mira la mascota: el foco con el que se calculó este estado. */
  focus: PetFocus;
  /** Sesiones vivas fuera del foco (#112): lo que `state` ya no cuenta. Siempre
   * 0 con el foco en `auto`, que mira a todas. */
  othersActive: number;
}

export interface QuotaWindow {
  utilization: number;
  resetsAt: string | null;
}

/**
 * Un límite de la lista `limits[]` del endpoint: los que tiene *esa* cuenta,
 * sin cablear modelos concretos. `kind`, `scope` y `severity` son abiertos a
 * propósito: un valor desconocido se muestra con `label` genérica, nunca se
 * descarta.
 */
export interface QuotaLimit {
  kind: string;
  group: string;
  scope: string | null;
  utilization: number;
  resetsAt: string | null;
  severity: "normal" | "warning" | "critical" | (string & {});
  isActive: boolean;
  /** Etiqueta legible calculada en el daemon (`5h`, `7d`, `<kind> · <scope>`). */
  label: string;
}

/**
 * De dónde sale el consumo de la ventana de 7 d (Claude Code, chats, Cowork…),
 * tal como lo reporta Anthropic. Dato del momento: no se persiste. `key` y
 * `label` son abiertos; un origen desconocido se conserva con su etiqueta.
 */
export interface WeeklyBreakdown {
  asOf: string | null;
  windowStartedAt: string | null;
  rows: { key: string; label: string; percent: number }[];
}

export interface QuotaProjection {
  /** `%` al que llegará la ventana de 5 h en su reset si sigue el ritmo de la
   * última hora. `null` con pocas muestras o sin endpoint: no se inventa. */
  fiveHourAtReset: number | null;
  /** Instante (ISO) en que la ventana de 5 h llega al 100 % al ritmo de la
   * última hora. Puede caer después del reset: entonces el uso llega hasta él.
   * `null` sin ritmo medible o con ritmo 0. */
  fiveHourExhaustsAt: string | null;
}

/** `GET /api/quota/history`: la serie de `quota_samples`. */
export interface QuotaHistoryResponse {
  samples: {
    at: string;
    fiveHour: number | null;
    sevenDay: number | null;
    local: number;
  }[];
}

/** `GET /api/quota/peaks`: el pico de la ventana de 5 h por día (UTC). */
export interface QuotaPeak {
  day: string;
  peak: number;
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
    limits: QuotaLimit[];
    weeklyBreakdown: WeeklyBreakdown | null;
  } | null;
  /** Reconstruida de los JSONL locales. Siempre presente. */
  local: {
    fiveHourTokens: number;
    fiveHourUtilization: number;
    /** `null`: sin endpoint y sin ventana activa (reset pasado sin uso posterior). */
    windowStartedAt: string | null;
    /** `false` hasta tener 3 ventanas cerradas: el techo es entonces el valor inicial del plan (#100). */
    calibrated: boolean;
    /** Ventanas cerradas válidas que lleva la calibración (el `n` de `n/3`, #117). */
    ceilingWindows: number;
    /**
     * `%` con el techo provisional de 1-2 ventanas cerradas (#117). `null` con 0
     * (no hay techo) y con 3 o más (ya vale `fiveHourUtilization`). No sustituye a
     * `fiveHourUtilization` ni a `calibrated`: la divergencia y la mascota no se
     * fían de un techo de una sola ventana.
     */
    provisionalUtilization: number | null;
  };
  /** authoritative.fiveHour - local.fiveHour. `null` si no hay endpoint. */
  divergence: number | null;
  /** Ritmo de la ventana de 5 h (#85). */
  projection: QuotaProjection;
  sampledAt: string;
  error: DaemonMessage | null;
  /**
   * Instante del último intento que dio 429 (#116). Un 429 no es un dato nuevo:
   * `authoritative`, si lo hay, sigue siendo el de `sampledAt`. `null` si el
   * último intento no fue un 429.
   */
  rateLimitedAt: string | null;
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

/**
 * Cómo suena lo que suena: energía × valencia con corte en 0,5. `podcast`
 * para episodios; `neutral` mientras no hay datos (o si ReccoBeats falla).
 */
export type Vibe =
  | "fiesta"
  | "intensa"
  | "chill"
  | "melancolica"
  | "podcast"
  | "neutral";

/** Lo que la capa de música de la mascota necesita de lo que suena. */
export interface Listening {
  vibe: Vibe;
  /** `null` en podcast y sin datos. */
  bpm: number | null;
  /** Basta el `id`: la mascota enseña la pista cuando cambia, sin marcas de
   * tiempo en el contrato. */
  track: { id: string; title: string; artist: string; imageUrl: string | null };
}

/** Un dispositivo Spotify Connect de `GET /api/media/devices`. */
export interface MediaDeviceOption extends MediaDevice {
  isActive: boolean;
  /** No acepta órdenes de la Web API: se lista, pero no se puede elegir. */
  isRestricted: boolean;
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
  /** `neutral` hasta que llegan los datos: sale en un segundo `media`. */
  vibe: Vibe;
  /** `null` en podcast y sin datos. */
  bpm: number | null;
}

/** Qué enseña la pantalla de Amnis al cambiar de canción. */
export type ScreenMode =
  | "two-phase"
  | "cover"
  | "cover-title"
  | "pixel"
  | "text"
  | "none";

/**
 * Preferencias de la capa de música de la mascota. Viven en el daemon
 * (`~/.amnis/settings.json`) y viajan por SSE: la mascota (webview de Tauri) y
 * el dashboard (navegador) no comparten `localStorage`, así que un ajuste
 * hecho en uno no llegaría al otro.
 *
 * No son configurables a propósito: la capa apagada en `waiting` y `limited`,
 * los colores de cada vibe, los umbrales de la vibe y el movimiento reducido
 * (lo decide el sistema operativo).
 */
export interface MusicPrefs {
  /** Interruptor general: apagado, Amnis no lleva nada de la capa. */
  enabled: boolean;
  /** Qué se mueve: la cabeza además del accesorio, o solo el accesorio. */
  motion: "head" | "accessory";
  /** 0–1: cuánto reduce la fatiga la amplitud del movimiento. */
  damping: number;
  color: "vibe" | "cover" | "teal";
  /** Sin datos de ReccoBeats: notas neutras, o solo los cascos. */
  fallback: "neutral" | "quiet";
  screen: ScreenMode;
  /** 2–8 s en pantalla. */
  screenSeconds: number;
  screenEntry: "tv" | "fade";
  /** Líneas de pantalla sobre la portada. */
  scanlines: boolean;
}

export const DEFAULT_MUSIC_PREFS: MusicPrefs = {
  enabled: true,
  motion: "head",
  damping: 0.7,
  color: "vibe",
  fallback: "neutral",
  screen: "two-phase",
  screenSeconds: 6,
  screenEntry: "tv",
  scanlines: true,
};

/**
 * A qué mira la mascota (E10): `auto` deja que el daemon elija la sesión más
 * reciente; el resto fija un repo, un worktree o una sesión concretos. Es una
 * sola selección compartida por la mascota y el dashboard.
 */
export type PetFocus =
  | { kind: "auto" }
  | { kind: "repo"; repoRoot: string }
  | { kind: "worktree"; worktree: string }
  | { kind: "session"; sessionId: string; worktree: string };

/**
 * Catálogo de temas (#121), compartido por el validador del daemon y el
 * selector de la web: dos listas a mano acabarían divergiendo. `scheme` es el
 * `color-scheme` de la paleta; `system` sigue la preferencia del sistema. Los
 * bloques CSS llegan en #123 y #124: hasta entonces un id sin bloque se ve con
 * el claro.
 */
export const THEMES = [
  { id: "system", label: "Sistema", scheme: "system" },
  { id: "light", label: "Claro", scheme: "light" },
  { id: "dark", label: "Oscuro", scheme: "dark" },
  { id: "nord", label: "Nord", scheme: "dark" },
  { id: "dracula", label: "Dracula", scheme: "dark" },
  { id: "solarized", label: "Solarized", scheme: "light" },
  { id: "gruvbox", label: "Gruvbox", scheme: "dark" },
  { id: "gruvbox-light", label: "Gruvbox claro", scheme: "light" },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", scheme: "dark" },
  { id: "catppuccin-latte", label: "Catppuccin Latte", scheme: "light" },
  { id: "tokyo-night", label: "Tokyo Night", scheme: "dark" },
  { id: "rose-pine", label: "Rosé Pine", scheme: "dark" },
  { id: "rose-pine-dawn", label: "Rosé Pine Dawn", scheme: "light" },
  { id: "everforest-light", label: "Everforest claro", scheme: "light" },
  { id: "medianoche", label: "Medianoche", scheme: "dark" },
  { id: "papel", label: "Papel", scheme: "light" },
  { id: "niebla", label: "Niebla", scheme: "light" },
  { id: "alto-contraste", label: "Alto contraste", scheme: "dark" },
] as const satisfies readonly {
  id: string;
  label: string;
  scheme: "light" | "dark" | "system";
}[];

export type ThemeId = (typeof THEMES)[number]["id"];

export function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

/** Idioma de la interfaz; `system` sigue al idioma del navegador o del webview. */
export const LOCALES = ["system", "es", "en"] as const;

export type LocaleId = (typeof LOCALES)[number];

export function isLocaleId(v: unknown): v is LocaleId {
  return LOCALES.some((l) => l === v);
}

/** Escalas del tamaño plegado de la mascota sobre 150×110. Rust repite la lista en `main.rs`. */
export const PET_SCALES = [0.75, 1, 1.3, 1.6] as const;

export type PetScale = (typeof PET_SCALES)[number];

export function isPetScale(v: unknown): v is PetScale {
  return PET_SCALES.some((s) => s === v);
}

/**
 * Todos los ajustes de `~/.amnis/settings.json`: las preferencias de la capa
 * de música, el plan elegido a mano (#84), el foco de la mascota (#108) y el
 * tema (#121). `plan` es solo el respaldo: lo detectado de las credenciales
 * de Claude siempre gana (`StateResponse.plan`).
 */
export interface AmnisSettings extends MusicPrefs {
  /** Id de un plan conocido, o `null` si no se ha elegido ninguno. */
  plan: string | null;
  petFocus: PetFocus;
  /** Una sola elección para dashboard y mascota, que no comparten `localStorage`. */
  theme: ThemeId;
  /** Por la misma razón que `theme`: una sola elección para las dos ventanas. */
  locale: LocaleId;
  /** Tamaño de la mascota plegada: va en el daemon porque el ajuste se hace en el navegador y se aplica en el webview. */
  petScale: PetScale;
  /** Consultar a GitHub si hay una release más nueva (#148). */
  checkUpdates: boolean;
  /** Versión cuyo aviso se descartó (#149): en el daemon y no en `localStorage`
   * para que valga a la vez en el dashboard, la mascota y la bandeja. */
  dismissedUpdate: string | null;
}

export const DEFAULT_SETTINGS: AmnisSettings = {
  ...DEFAULT_MUSIC_PREFS,
  plan: null,
  petFocus: { kind: "auto" },
  theme: "system",
  locale: "system",
  petScale: 1,
  checkUpdates: true,
  dismissedUpdate: null,
};

/** El plan de la suscripción, ya resuelto (detectado > manual). */
export interface PlanInfo {
  id: string;
  label: string;
  /** USD al mes: lo que se compara con el coste equivalente de API. */
  monthlyUsd: number;
  source: "detected" | "manual";
}

/** Una release publicada más nueva que la versión instalada (#148). */
export interface UpdateInfo {
  /** Sin la `v` del tag: `0.3.0`. */
  version: string;
  /** Página de la release en GitHub. */
  url: string;
}

/** Lo que se avisa: la versión nueva, salvo que sea la descartada. */
export function pendingUpdate(
  update: UpdateInfo | null,
  settings: Pick<AmnisSettings, "dismissedUpdate">,
): UpdateInfo | null {
  return update && update.version !== settings.dismissedUpdate ? update : null;
}

export interface StateResponse {
  pet: PetSnapshot;
  quotas: QuotaSnapshot[];
  media: MediaSnapshot;
  settings: AmnisSettings;
  /** `null` si no se detecta ni hay uno manual. */
  plan: PlanInfo | null;
  /** `null` si no hay versión nueva o si la comprobación está apagada. */
  update: UpdateInfo | null;
  daemon: {
    version: string;
    startedAt: string;
    eventsReceived: number;
    usageEvents: number;
  };
}

/** Un chequeo de `amnis doctor` / `GET /api/health` (#89). */
export interface HealthCheck {
  name: string;
  ok: boolean;
  message: DaemonMessage;
  /** `null` solo cuando `ok`. Un fallo sin remedio es el ✗ inútil que la issue quiere evitar. */
  remedy: DaemonMessage | null;
}

/** `GET /api/health`: el mismo diagnóstico que `amnis doctor`. */
export interface HealthResponse {
  checks: HealthCheck[];
  daemon: {
    version: string;
    startedAt: string;
    eventsReceived: number;
  };
}

/** `POST /api/hooks/install`: qué se reparó y dónde quedó la copia. */
export interface RepairHooksResponse {
  /** Eventos que no tenían hook de Amnis y ahora sí. */
  added: string[];
  /** Copia de seguridad del settings.json; `null` si no hubo que escribir. */
  backup: string | null;
}

/** Evento SSE `rebuild`: fin de `POST /api/ingest/rebuild`. */
export interface RebuildEvent {
  status: "done" | "error";
  error?: DaemonMessage;
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
  | { event: "media"; data: MediaSnapshot }
  | { event: "settings"; data: AmnisSettings }
  | { event: "rebuild"; data: RebuildEvent }
  | { event: "update"; data: UpdateInfo | null }
  /** «Cerrar Amnis»: la ventana de la mascota cierra la app de escritorio. */
  | { event: "quit"; data: null };

/** Evento de hook ya normalizado por el `Provider`. */
export interface NormalizedHookEvent {
  provider: ProviderId;
  hook: string;
  toolName: string | null;
  sessionId: string | null;
  project: string | null;
  permissionMode: string | null;
  command: string | null;
  /** `reason` de `SessionEnd` o `source` de `SessionStart`; `null` en el resto. */
  sessionReason: string | null;
  /** `notification_type` de `Notification` (`permission_prompt`, `idle_prompt`…);
   * `null` en el resto o si no viene. */
  notificationType: string | null;
  at: string;
}

/**
 * Los doce estados agrupados en cuatro: doce colores en una franja estrecha no
 * se distinguen. `thinking` = investigando o planificando.
 */
export type ActivityGroup = "working" | "thinking" | "waiting" | "resting";

/** Un tramo de una sesión en un estado. `end` ya está recortado al día. */
export interface ActivitySegment {
  sessionId: string;
  state: PetState;
  group: ActivityGroup;
  start: string;
  end: string;
}

export interface ActivitySession {
  sessionId: string;
  /** Nombre (no la ruta) del proyecto; `null` si ningún evento lo traía. */
  project: string | null;
  /** Última rama de git vista en el uso de la sesión; `null` si no hay. */
  gitBranch: string | null;
  start: string;
  end: string;
  /** Minutos en tramos que no son `resting`. */
  activeMinutes: number;
  tokens: number;
  /** Equivalente de API, no dinero gastado (DESIGN §2). */
  costUsd: number;
}

/** `GET /api/activity?day=YYYY-MM-DD` (día local del daemon). */
export interface ActivityResponse {
  day: string;
  sessions: ActivitySession[];
  segments: ActivitySegment[];
  /** Minutos por estado, sin redondear. Su suma es la de los tramos. */
  byState: Partial<Record<PetState, number>>;
  /** Tiempo en `waiting`: cuánto te esperó y en cuántos avisos. */
  waiting: { minutes: number; count: number };
}

/** `GET /api/activity/heatmap?weeks=4`: minutos de agente (sin `resting`). */
export interface ActivityHeatmapResponse {
  weeks: number;
  from: string;
  to: string;
  /** 7 filas (0 = lunes) × 24 horas, en hora local del daemon. */
  minutes: number[][];
}

export * from "./messages.ts";
export { PLANS, PLANS_DATE, resolvePlan } from "./plans.ts";
export { SERIES_ANIMATIONS } from "./seriesAnimations.ts";
export * from "./skin.ts";
export * from "./skinAnimation.ts";

/** Una sesión de agente vista por hooks (`GET /api/sessions`, #107). */
export interface SessionSummary {
  sessionId: string;
  /** Viva: el último estado conocido. Terminada o inactiva: `sleeping`. */
  state: PetState;
  lastEventAt: string;
  startedAt: string;
  /** Sin `SessionEnd` y con hooks dentro de la ventana de inactividad. */
  alive: boolean;
}

export interface WorktreeSummary {
  /** Raíz del worktree: lo que usa `PetFocus` de tipo `worktree`. */
  worktree: string;
  name: string;
  /** Última rama vista en el uso de sus sesiones; `null` si no hay. */
  branch: string | null;
  sessions: SessionSummary[];
}

export interface RepoSummary {
  repoRoot: string;
  name: string;
  worktrees: WorktreeSummary[];
}

/**
 * `GET /api/sessions`: los repos, worktrees y sesiones con hooks en las
 * últimas 24 h, lo más reciente primero. Las terminadas se listan pero no
 * se pueden elegir como foco; cada cliente decide si las enseña (#127).
 */
export interface SessionsResponse {
  repos: RepoSummary[];
}
