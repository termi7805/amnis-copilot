/**
 * Los planes y `resolvePlan` viven en `@amnis/shared` (el dashboard también los
 * necesita); aquí queda lo que solo hace el daemon: leer el plan de las
 * credenciales.
 */
export { PLANS, PLANS_DATE, resolvePlan } from "@amnis/shared";

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
