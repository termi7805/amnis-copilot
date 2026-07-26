import type { DatabaseSync } from "node:sqlite";

/**
 * Suma de tokens en la ventana. Las cuatro columnas, no solo input/output:
 * es la medida más completa de actividad. No hace falta que coincida con
 * la definición interna de Anthropic — el techo se calibra contra el `%`
 * autoritativo usando esta misma suma (domain/localQuota.ts), así que
 * cualquier diferencia de definición queda absorbida ahí. Lo que importa
 * es sumar igual al calibrar y al estimar.
 */
export function tokensInWindow(
  db: DatabaseSync,
  accountId: number,
  since: Date,
): number {
  const row = db
    .prepare(`
      SELECT COALESCE(SUM(
        input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens
      ), 0) AS total
      FROM usage_events
      WHERE account_id = ? AND ts >= ?
    `)
    .get(accountId, since.toISOString()) as { total: number };
  return row.total;
}

/** ts ascendente. Alimenta findGapStart() cuando no hay ningún reset conocido. */
export function usageTimestamps(db: DatabaseSync, accountId: number): Date[] {
  const rows = db
    .prepare("SELECT ts FROM usage_events WHERE account_id = ? ORDER BY ts ASC")
    .all(accountId) as { ts: string }[];
  return rows.map((r) => new Date(r.ts));
}
