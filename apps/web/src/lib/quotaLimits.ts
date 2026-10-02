import type { QuotaLimit } from "@amnis/shared";

/**
 * Límites que no son ya los anillos fijos 5h/7d: los de modelo u otro `scope`
 * y cualquier `kind` desconocido. Una cuenta sin ellos no ve nada extra.
 */
export function extraLimits(limits: QuotaLimit[]): QuotaLimit[] {
  return limits.filter(
    (l) =>
      !(l.scope === null && (l.kind === "session" || l.kind === "weekly_all")),
  );
}
