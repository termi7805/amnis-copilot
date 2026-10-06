import type { PlanInfo } from "./types.ts";

/**
 * Precios mensuales de los planes de suscripción, en USD. Es un dato que
 * envejece, como `SEED_PRICES` en `cost.ts`: `PLANS_DATE` dice cuándo se
 * escribió a mano por última vez. Vive en `shared` porque el dashboard lista
 * los planes en el selector manual y el daemon los valida.
 */
export const PLANS_DATE = "2026-10-06";

export const PLANS: Record<string, { label: string; monthlyUsd: number }> = {
  pro: { label: "Pro", monthlyUsd: 20 },
  max_5x: { label: "Max 5x", monthlyUsd: 100 },
  max_20x: { label: "Max 20x", monthlyUsd: 200 },
  // Team, por asiento y con pago mensual, como el resto de la tabla.
  team_standard: { label: "Team Standard", monthlyUsd: 25 },
  team_premium: { label: "Team Premium", monthlyUsd: 125 },
};

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
