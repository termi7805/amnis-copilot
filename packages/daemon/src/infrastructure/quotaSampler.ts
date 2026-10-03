import type { DatabaseSync } from "node:sqlite";
import type { QuotaSnapshot } from "@amnis/shared";
import { sampleQuota } from "../application/sampleQuota.ts";
import { PLAN_WINDOW_TOKENS } from "../config.ts";
import type { Provider } from "../domain/Provider.ts";
import type { IngestOutcome } from "./ingestRunner.ts";
import {
  getPlanWindowTokens,
  savePlanWindowTokens,
} from "./persistence/accounts.ts";
import {
  insertQuotaSample,
  lastKnownReset,
  samplesBetween,
} from "./persistence/quotaSamples.ts";
import { tokensInWindow, usageTimestamps } from "./persistence/usage.ts";

/**
 * Cablea `sampleQuota` (application/) contra `node:sqlite` y un `Provider`
 * concreto. Separado del poller a propósito: `GET /api/state` (#26)
 * necesita este mismo cableado sin querer un temporizador.
 */
export function createQuotaSampler(
  db: DatabaseSync,
  accountId: number,
  provider: Provider,
  /** Plan vigente (#84): solo da el valor inicial del techo. */
  planId: () => string | null = () => null,
  /**
   * Deja la caché de uso al día antes de muestrear (#98). Sin él (tests, el
   * CLI) se da por buena: es lo que pasaba antes de la ingesta automática.
   */
  ensureFresh: () => Promise<IngestOutcome> = () => Promise.resolve("fresh"),
): () => Promise<QuotaSnapshot> {
  return async (now: Date = new Date()) => {
    // Antes del sondeo: el `%` real y los tokens locales deben ser del mismo
    // instante (DESIGN §2), y la ingesta es lo que lo hace cierto.
    const outcome = await ensureFresh();
    const snapshot = await sampleQuota(
      {
        pollQuota: () => provider.pollQuota(),
        localFresh: outcome === "fresh",
        tokensInWindow: (since) => tokensInWindow(db, accountId, since),
        usageTimestamps: () => usageTimestamps(db, accountId),
        lastKnownReset: () => {
          const iso = lastKnownReset(db, accountId);
          return iso ? new Date(iso) : null;
        },
        getPlanWindowTokens: () => getPlanWindowTokens(db, accountId),
        savePlanWindowTokens: (tokens) =>
          savePlanWindowTokens(db, accountId, tokens),
        // Valor inicial del techo, hasta que se calibre solo: el del plan
        // vigente si se conoce, y "pro" si no. El `?? 44_000` solo satisface
        // noUncheckedIndexedAccess: la clave "pro" siempre existe.
        defaultPlanWindowTokens:
          PLAN_WINDOW_TOKENS[planId() ?? "pro"] ??
          PLAN_WINDOW_TOKENS.pro ??
          44_000,
        fiveHourSamplesSince: (from) =>
          samplesBetween(db, accountId, from, new Date())
            .filter((r) => r.fiveHourUtil !== null)
            .map((r) => ({
              at: new Date(r.ts),
              utilization: r.fiveHourUtil as number,
            })),
        insertQuotaSample: (sample) =>
          insertQuotaSample(db, { accountId, ...sample }),
      },
      now,
    );
    // sampleQuota() (application/) es agnóstica de proveedor; el provider
    // solo lo conoce quien cablea, aquí.
    return { ...snapshot, provider: provider.id };
  };
}
