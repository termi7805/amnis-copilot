import type { DatabaseSync } from "node:sqlite";
import type { QuotaSnapshot } from "@amnis/shared";
import { sampleQuota } from "../application/sampleQuota.ts";
import { PLAN_WINDOW_TOKENS } from "../config.ts";
import type { Provider } from "../domain/Provider.ts";
import {
  getPlanWindowTokens,
  savePlanWindowTokens,
} from "./persistence/accounts.ts";
import {
  insertQuotaSample,
  lastKnownReset,
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
): () => Promise<QuotaSnapshot> {
  return async (now: Date = new Date()) => {
    const snapshot = await sampleQuota(
      {
        pollQuota: () => provider.pollQuota(),
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
