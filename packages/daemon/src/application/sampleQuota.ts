import type { QuotaSnapshot } from "@amnis/shared";
import {
  calibrate,
  estimate,
  FIVE_HOUR_MS,
  findGapStart,
  windowStart,
} from "../domain/localQuota.ts";
import type { QuotaReading } from "../domain/Provider.ts";

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
  opusUtil: number | null;
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
  usageTimestamps(): Date[];
  /** El `resets_at` no nulo más reciente de una muestra anterior. */
  lastKnownReset(): Date | null;
  /** El techo calibrado (2.4), o `null` si aún no se ha calibrado. */
  getPlanWindowTokens(): number | null;
  savePlanWindowTokens(tokens: number): void;
  defaultPlanWindowTokens: number;
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
  const ceiling = deps.getPlanWindowTokens() ?? deps.defaultPlanWindowTokens;
  const localUtilization = estimate(localTokens, ceiling);

  let divergence: number | null = null;
  if (authoritative) {
    divergence = authoritative.fiveHour.utilization - localUtilization;

    // Solo se calibra con muestra autoritativa y utilización suficiente:
    // por debajo del ~10% el cociente es ruido y envenenaría el techo.
    const calibrated = calibrate(
      localTokens,
      authoritative.fiveHour.utilization,
    );
    if (calibrated !== null) deps.savePlanWindowTokens(calibrated);
  }

  deps.insertQuotaSample({
    ts: now.toISOString(),
    fiveHourUtil: authoritative?.fiveHour.utilization ?? null,
    fiveHourResetsAt: authoritative?.fiveHour.resetsAt ?? null,
    sevenDayUtil: authoritative?.sevenDay.utilization ?? null,
    sevenDayResetsAt: authoritative?.sevenDay.resetsAt ?? null,
    opusUtil: authoritative?.sevenDayOpus?.utilization ?? null,
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
    sampledAt: now.toISOString(),
    error: reading.error,
  };
}
