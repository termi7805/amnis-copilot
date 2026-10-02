import type { PlanInfo } from "@amnis/shared";
import { detectPlanId, resolvePlan } from "../domain/plans.ts";
import { readCredentials } from "./providers/anthropic/credentials.ts";

/**
 * El plan vigente: lo detectado en las credenciales de Claude (solo lectura;
 * es barato, se relee en cada llamada como el poll de cuota) y, si no hay de
 * dónde leerlo, el elegido a mano. Sin sesión o con credenciales rotas, lo
 * detectado es `null` y manda el respaldo.
 */
export function currentPlan(
  manualPlanId: string | null,
  read: typeof readCredentials = readCredentials,
): PlanInfo | null {
  const credentials = read();
  const detectedId = credentials.ok
    ? detectPlanId(
        credentials.token.subscriptionType,
        credentials.token.rateLimitTier,
      )
    : null;
  return resolvePlan(detectedId, manualPlanId);
}
