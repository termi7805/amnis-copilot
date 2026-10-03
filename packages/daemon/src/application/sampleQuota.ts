import type { QuotaSnapshot } from "@amnis/shared";
import {
  CEILING_WINDOWS,
  type CeilingWindow,
  calibrate,
  estimate,
  FIVE_HOUR_MS,
  findGapStart,
  MIN_CEILING_UTILIZATION,
  robustCeiling,
  windowStart,
} from "../domain/localQuota.ts";
import type { QuotaReading } from "../domain/Provider.ts";
import { type PaceSample, projectAtReset } from "../domain/pace.ts";

/**
 * `sampleQuota` es agnóstica de proveedor: no sabe qué `Provider` la llamó.
 * `quotaSampler.ts` (infrastructure/, que sí conoce el `Provider`) añade
 * `.provider` al resultado antes de que salga de ahí.
 */
type ProviderlessQuotaSnapshot = Omit<QuotaSnapshot, "provider">;

export interface QuotaSampleInput {
  ts: string;
  fiveHourUtil: number | null;
  fiveHourResetsAt: string | null;
  sevenDayUtil: number | null;
  sevenDayResetsAt: string | null;
  limitsJson: string | null;
  localTokens: number;
  localUtil: number;
  source: "both" | "local";
  error: string | null;
}

/**
 * Todo lo que `sampleQuota` necesita de fuera. `application/` no importa
 * `config.ts` ni `node:sqlite`: `defaultPlanWindowTokens` (el valor
 * inicial de `PLAN_WINDOW_TOKENS`) y las funciones de persistencia las
 * inyecta `infrastructure/`.
 */
export interface SampleQuotaDeps {
  pollQuota(): Promise<QuotaReading>;
  tokensInWindow(since: Date): number;
  /**
   * La caché de uso quedó al día justo antes de esta muestra (#98). Si no
   * (ingesta fallida, o reconstrucción en curso), `localTokens` es parcial y
   * dividirlo por el `%` real daría un techo a la mitad: la muestra se guarda,
   * pero no calibra.
   */
  localFresh: boolean;
  usageTimestamps(): Date[];
  /** Primer evento de uso con `ts ≥ t`, `null` si no hay (#99). */
  firstUsageAtOrAfter(t: Date): Date | null;
  /** El `resets_at` no nulo más reciente de una muestra anterior. */
  lastKnownReset(): Date | null;
  /** Las últimas `limit` ventanas cerradas del plan vigente, de la más reciente a la más antigua (#100). */
  closedCeilings(limit: number): CeilingWindow[];
  /** Registra (o reescribe) la última muestra válida de la ventana que acaba en `windowEnd`. */
  saveWindowCeiling(window: CeilingWindow & { windowEnd: string }): void;
  defaultPlanWindowTokens: number;
  /** Muestras con endpoint desde `from`, para medir el ritmo (#85). */
  fiveHourSamplesSince(from: Date): PaceSample[];
  insertQuotaSample(sample: QuotaSampleInput): void;
}

/**
 * Muestra las dos vías de cuota del mismo instante y persiste su
 * divergencia. Se calculan siempre en paralelo — la vía local no es un
 * fallback, es la que revela cuánto se consume fuera de Claude Code
 * (DESIGN.md §2).
 */
export async function sampleQuota(
  deps: SampleQuotaDeps,
  now: Date,
): Promise<ProviderlessQuotaSnapshot> {
  const reading = await deps.pollQuota();
  const authoritative = reading.authoritative;

  // Con endpoint el inicio es autoritativo (`resets_at − 5h`). Sin él se infiere
  // del último reset conocido; sin ninguno, del primer hueco > 5h. `null`: no
  // hay ventana activa (reset pasado sin uso posterior), y se estima 0.
  const resetsAt = authoritative?.fiveHour.resetsAt;
  const lastReset = deps.lastKnownReset();
  const windowStartedAt = resetsAt
    ? new Date(new Date(resetsAt).getTime() - FIVE_HOUR_MS)
    : lastReset
      ? windowStart(now, lastReset, deps.firstUsageAtOrAfter)
      : (findGapStart(deps.usageTimestamps(), FIVE_HOUR_MS) ?? now);

  const localTokens = windowStartedAt
    ? deps.tokensInWindow(windowStartedAt)
    : 0;
  // El techo es la mediana de las últimas ventanas cerradas, no la última
  // muestra: así la estimación local es independiente del endpoint y la
  // divergencia mide el uso fuera de Claude Code (#100). Sin 3 ventanas
  // cerradas aún, vale el valor inicial del plan.
  const robust = robustCeiling(deps.closedCeilings(CEILING_WINDOWS));
  const calibrated = robust !== null;
  const ceiling = robust ?? deps.defaultPlanWindowTokens;
  const localUtilization = estimate(localTokens, ceiling);

  let divergence: number | null = null;
  let fiveHourAtReset: number | null = null;
  if (authoritative) {
    divergence = authoritative.fiveHour.utilization - localUtilization;

    // Se registra la ventana en curso solo con muestra autoritativa, tokens al
    // día (#98) y utilización suficiente. La última muestra de la ventana gana;
    // solo las ya cerradas entran en la mediana.
    const resets = authoritative.fiveHour.resetsAt;
    if (
      resets &&
      deps.localFresh &&
      authoritative.fiveHour.utilization >= MIN_CEILING_UTILIZATION &&
      calibrate(localTokens, authoritative.fiveHour.utilization) !== null
    ) {
      deps.saveWindowCeiling({
        windowEnd: resets,
        tokens: localTokens,
        utilization: authoritative.fiveHour.utilization,
      });
    }

    // La ventana es fija: se proyecta desde `resets_at − 5 h` y se para en el
    // reset. La muestra actual aún no está en la BD, se añade a mano.
    if (resets) {
      const resetsAt = new Date(resets);
      const start = new Date(resetsAt.getTime() - FIVE_HOUR_MS);
      fiveHourAtReset = projectAtReset(
        [
          ...deps.fiveHourSamplesSince(start),
          { at: now, utilization: authoritative.fiveHour.utilization },
        ],
        start,
        resetsAt,
      );
    }
  }

  deps.insertQuotaSample({
    ts: now.toISOString(),
    fiveHourUtil: authoritative?.fiveHour.utilization ?? null,
    fiveHourResetsAt: authoritative?.fiveHour.resetsAt ?? null,
    sevenDayUtil: authoritative?.sevenDay.utilization ?? null,
    sevenDayResetsAt: authoritative?.sevenDay.resetsAt ?? null,
    limitsJson: authoritative ? JSON.stringify(authoritative.limits) : null,
    localTokens,
    localUtil: localUtilization,
    source: authoritative ? "both" : "local",
    error: reading.error,
  });

  return {
    authoritative,
    local: {
      fiveHourTokens: localTokens,
      fiveHourUtilization: localUtilization,
      windowStartedAt: windowStartedAt?.toISOString() ?? null,
      calibrated,
    },
    divergence,
    projection: { fiveHourAtReset },
    sampledAt: now.toISOString(),
    error: reading.error,
  };
}
