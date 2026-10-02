import type { DatabaseSync } from "node:sqlite";
import { apiEquivalent, isPriced, type PriceTable } from "../../domain/cost.ts";

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

export type UsageGroupBy = "day" | "project" | "model";

export interface AggregateOptions {
  groupBy: UsageGroupBy;
  from?: Date;
  to?: Date;
}

export interface UsageAggregateRow {
  key: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export interface UsageAggregate {
  rows: UsageAggregateRow[];
  /** Modelos con tokens en el rango y sin precio: su coste cuenta 0, y
   * eso tiene que verse en vez de pasar por "barato". */
  unpricedModels: string[];
}

const GROUP_KEY_SQL: Record<UsageGroupBy, string> = {
  day: "date(ts)",
  project: "COALESCE(project, '')",
  model: "COALESCE(model, '')",
};

/**
 * Agrega desde los eventos crudos, nunca desde una tabla de rollups: cambiar
 * la fórmula de coste (domain/cost.ts) no debe obligar a reingerir nada.
 *
 * El coste no se puede sumar sobre tokens ya agrupados por día/proyecto —
 * un grupo puede mezclar modelos con precios distintos. Se agrega primero
 * por (grupo, modelo) en SQL, y el coste por modelo se combina en JS.
 */
export function aggregate(
  db: DatabaseSync,
  accountId: number,
  options: AggregateOptions,
  prices: PriceTable,
): UsageAggregate {
  const keyExpr = GROUP_KEY_SQL[options.groupBy];
  const conditions = ["account_id = ?"];
  const params: (string | number)[] = [accountId];

  if (options.from) {
    conditions.push("ts >= ?");
    params.push(options.from.toISOString());
  }
  if (options.to) {
    conditions.push("ts <= ?");
    params.push(options.to.toISOString());
  }

  const rows = db
    .prepare(`
      SELECT
        ${keyExpr} AS key,
        model,
        SUM(input_tokens) AS inputTokens,
        SUM(output_tokens) AS outputTokens,
        SUM(cache_creation_tokens) AS cacheCreationTokens,
        SUM(cache_read_tokens) AS cacheReadTokens
      FROM usage_events
      WHERE ${conditions.join(" AND ")}
      GROUP BY key, model
    `)
    .all(...params) as {
    key: string;
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  }[];

  const byKey = new Map<string, UsageAggregateRow>();
  const unpriced = new Set<string>();
  for (const row of rows) {
    const tokens =
      row.inputTokens +
      row.outputTokens +
      row.cacheCreationTokens +
      row.cacheReadTokens;
    if (row.model && tokens > 0 && !isPriced(row.model, prices)) {
      unpriced.add(row.model);
    }
    const acc = byKey.get(row.key) ?? {
      key: row.key,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
    };
    acc.inputTokens += row.inputTokens;
    acc.outputTokens += row.outputTokens;
    acc.cacheCreationTokens += row.cacheCreationTokens;
    acc.cacheReadTokens += row.cacheReadTokens;
    acc.costUsd += apiEquivalent(
      {
        model: row.model,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheCreationTokens: row.cacheCreationTokens,
        cacheReadTokens: row.cacheReadTokens,
      },
      prices,
    );
    byKey.set(row.key, acc);
  }

  return {
    rows: [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)),
    unpricedModels: [...unpriced].sort(),
  };
}
