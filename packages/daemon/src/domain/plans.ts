import type { PlanInfo } from "@amnis/shared";

/**
 * Precios mensuales de los planes de suscripción, en USD. Es un dato que
 * envejece, como `SEED_PRICES` en `cost.ts`: `PLANS_DATE` dice cuándo se
 * escribió a mano por última vez.
 */
export const PLANS_DATE = "2026-10-03";

export const PLANS: Record<string, { label: string; monthlyUsd: number }> = {
  pro: { label: "Pro", monthlyUsd: 20 },
  max_5x: { label: "Max 5x", monthlyUsd: 100 },
  max_20x: { label: "Max 20x", monthlyUsd: 200 },
};

/**
 * Id de plan a partir de lo que trae `.credentials.json`. `rateLimitTier` solo
 * distingue Max 5x de Max 20x; si no es concluyente (o el `subscriptionType`
 * es otro: Team, Enterprise, uno nuevo) devuelve `null` en vez de adivinar, y
 * es el ajuste manual quien cubre el hueco.
 */
export function detectPlanId(
  subscriptionType: string | null,
  rateLimitTier: string | null,
): string | null {
  if (subscriptionType === "pro") return "pro";
  if (subscriptionType === "max") {
    const tier = rateLimitTier ?? "";
    if (tier.includes("20x")) return "max_20x";
    if (tier.includes("5x")) return "max_5x";
  }
  return null;
}

/**
 * Lo detectado siempre gana a lo manual: si no, una elección antigua taparía
 * un cambio real de plan. Un id que la tabla no conoce no cuenta.
 */
export function resolvePlan(
  detectedId: string | null,
  manualId: string | null,
): PlanInfo | null {
  const detected = detectedId ? PLANS[detectedId] : undefined;
  if (detectedId && detected) {
    return { id: detectedId, ...detected, source: "detected" };
  }
  const manual = manualId ? PLANS[manualId] : undefined;
  if (manualId && manual) return { id: manualId, ...manual, source: "manual" };
  return null;
}
