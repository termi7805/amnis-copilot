import type {
  DaemonMessage,
  NormalizedHookEvent,
  ProviderId,
  QuotaLimit,
  QuotaWindow,
  WeeklyBreakdown,
} from "@amnis/shared";

export interface IngestResult {
  filesScanned: number;
  linesRead: number;
  eventsInserted: number;
  duplicatesSkipped: number;
}

/** Forma cruda de un evento de uso, tal como la produce cualquier provider. */
export interface ProviderUsageEvent {
  dedupeKey: string;
  sessionId: string | null;
  project: string | null;
  /** Rama de git del `cwd` en ese mensaje; `null` si el transcript no la trae. */
  gitBranch: string | null;
  ts: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  /** Parte de `cacheCreationTokens` escrita en la caché de 1 h (el resto es de
   * 5 min). 0 si el transcript no trae el desglose. */
  cacheCreation1hTokens: number;
  cacheReadTokens: number;
  serviceTier: string | null;
}

/**
 * Lo que `ingestHistorical` necesita persistir, sin saber que debajo hay
 * SQLite. `infrastructure/persistence/usageStore.ts` es quien lo implementa.
 */
export interface UsageStore {
  getOffset(filePath: string): { size: number; offset: number } | undefined;
  saveOffset(filePath: string, size: number, offset: number): void;
  /** `true` si se insertó; `false` si `dedupeKey` ya existía. */
  insertUsageEvent(providerId: ProviderId, event: ProviderUsageEvent): boolean;
}

/**
 * Lectura de cuota. `authoritative` es `null` cuando el endpoint no
 * respondió o todavía no hay implementación (ver #14): degradar es el
 * camino normal, no un caso de error (DESIGN.md §2).
 */
export interface QuotaReading {
  authoritative: {
    fiveHour: QuotaWindow;
    sevenDay: QuotaWindow;
    limits: QuotaLimit[];
    weeklyBreakdown: WeeklyBreakdown | null;
  } | null;
  error: DaemonMessage | null;
  /**
   * El endpoint limitó la consulta (#116). Tipado aparte de `error`: un 429 no
   * es un dato nuevo ni un fallo, es un «ahora no», y distinguirlo comparando
   * el texto del error sería frágil.
   */
  rateLimited: boolean;
}

/**
 * El único contrato del proyecto. Vive en `domain/` para que la
 * dependencia apunte hacia dentro: el núcleo declara qué necesita de un
 * provider, y cada `infrastructure/providers/<id>/` obedece.
 *
 * Segunda implementación prevista y descrita (Antigravity, DESIGN.md §6):
 * es la única razón por la que esto es una interfaz y no una función.
 */
export interface Provider {
  readonly id: ProviderId;
  ingestHistorical(store: UsageStore): IngestResult;
  pollQuota(): Promise<QuotaReading>;
  normalizeHookEvent(raw: unknown): NormalizedHookEvent | null;
}
