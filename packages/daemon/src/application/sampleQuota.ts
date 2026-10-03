import type { QuotaSnapshot } from "@amnis/shared";
import {
  calibrate,
  estimate,
  FIVE_HOUR_MS,
  findGapStart,
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
  /** El `resets_at` no nulo más reciente de una muestra anterior. */
  lastKnownReset(): Date | null;
  /** El techo calibrado (2.4), o `null` si aún no se ha calibrado. */
  getPlanWindowTokens(): number | null;
  savePlanWindowTokens(tokens: number): void;
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

  const resetsAt = authoritative?.fiveHour.resetsAt;
  const lastReset = resetsAt
    ? new Date(new Date(resetsAt).getTime() - FIVE_HOUR_MS)
    : (deps.lastKnownReset() ?? undefined);

  const windowStartedAt = lastReset
    ? windowStart(now, lastReset)
    : (findGapStart(deps.usageTimestamps(), FIVE_HOUR_MS) ?? now);

  const localTokens = deps.tokensInWindow(windowStartedAt);
  // Un 0 almacenado no es un techo calibrado, es "sin calibrar todavía"
  // (calibrate() ya no debería guardarlo, pero una BD anterior a esa
  // guarda puede tenerlo, y dividir entre 0 produce NaN/Infinity).
  const stored = deps.getPlanWindowTokens();
  const ceiling =
    stored !== null && stored > 0 ? stored : deps.defaultPlanWindowTokens;
  const localUtilization = estimate(localTokens, ceiling);

  let divergence: number | null = null;
  let fiveHourAtReset: number | null = null;
  if (authoritative) {
    divergence = authoritative.fiveHour.utilization - localUtilization;

    // Solo se calibra con muestra autoritativa y utilización suficiente:
    // por debajo del ~10% el cociente es ruido y envenenaría el techo.
    const calibrated = deps.localFresh
      ? calibrate(localTokens, authoritative.fiveHour.utilization)
      : null;
    if (calibrated !== null) deps.savePlanWindowTokens(calibrated);

    // La ventana es fija: se proyecta desde `resets_at − 5 h` y se para en el
    // reset. La muestra actual aún no está en la BD, se añade a mano.
    const resets = authoritative.fiveHour.resetsAt;
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
      windowStartedAt: windowStartedAt.toISOString(),
    },
    divergence,
    projection: { fiveHourAtReset },
    sampledAt: now.toISOString(),
    error: reading.error,
  };
}
