import type { QuotaSnapshot } from "@amnis/shared";
import {
  CEILING_WINDOWS,
  type CeilingWindow,
  calibrate,
  ceilingWindowCount,
  estimate,
  FIVE_HOUR_MS,
  findGapStart,
  MIN_CEILING_UTILIZATION,
  provisionalCeiling,
  robustCeiling,
  windowStart,
} from "../domain/localQuota.ts";
import type { QuotaReading } from "../domain/Provider.ts";
import { exhaustsAt, type PaceSample, projectAtReset } from "../domain/pace.ts";

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
  /** La última muestra del poller: lo que un 429 conserva (#116). */
  previous: ProviderlessQuotaSnapshot | null = null,
): Promise<ProviderlessQuotaSnapshot> {
  const reading = await deps.pollQuota();

  // Un 429 no es un dato nuevo, es un «ahora no»: se conserva lo que había y
  // no se deja fila (ensuciaría el historial y la proyección). Solo mientras
  // su ventana siga abierta: pasado el `resets_at` ese `%` es de una ventana
  // cerrada y enseñarlo es mentir.
  const rateLimitedAt = reading.rateLimited ? now.toISOString() : null;
  if (reading.rateLimited) {
    const resets = previous?.authoritative?.fiveHour.resetsAt;
    if (previous && resets && new Date(resets).getTime() > now.getTime()) {
      return { ...previous, error: reading.error, rateLimitedAt };
    }
  }
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
  const closed = deps.closedCeilings(CEILING_WINDOWS);
  const robust = robustCeiling(closed);
  const calibrated = robust !== null;
  const ceiling = robust ?? deps.defaultPlanWindowTokens;
  const localUtilization = estimate(localTokens, ceiling);
  // Con 1-2 ventanas hay un techo razonable pero no robusto (#117): se expone
  // aparte, sin tocar `calibrated` ni la divergencia.
  const provisional = provisionalCeiling(closed);
  const provisionalUtilization =
    provisional === null ? null : estimate(localTokens, provisional);

  let divergence: number | null = null;
  let fiveHourAtReset: number | null = null;
  let fiveHourExhaustsAt: string | null = null;
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
      const paceSamples = [
        ...deps.fiveHourSamplesSince(start),
        { at: now, utilization: authoritative.fiveHour.utilization },
      ];
      fiveHourAtReset = projectAtReset(paceSamples, start, resetsAt);
      fiveHourExhaustsAt =
        exhaustsAt(paceSamples, start, resetsAt)?.toISOString() ?? null;
    }
  }

  // Un 429 sin muestra vigente que conservar cae a la estimación local, pero
  // tampoco deja fila.
  if (!reading.rateLimited) {
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
      // La columna es texto: el mensaje va serializado, con su clave y parámetros.
      error: reading.error ? JSON.stringify(reading.error) : null,
    });
  }

  return {
    authoritative,
    local: {
      fiveHourTokens: localTokens,
      fiveHourUtilization: localUtilization,
      windowStartedAt: windowStartedAt?.toISOString() ?? null,
      calibrated,
      ceilingWindows: ceilingWindowCount(closed),
      provisionalUtilization,
    },
    divergence,
    projection: { fiveHourAtReset, fiveHourExhaustsAt },
    sampledAt: now.toISOString(),
    error: reading.error,
    rateLimitedAt,
  };
}
