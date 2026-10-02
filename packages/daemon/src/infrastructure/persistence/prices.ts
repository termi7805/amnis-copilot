import type { DatabaseSync } from "node:sqlite";
import {
  type PriceTable,
  SEED_PRICES,
  SEED_PRICES_DATE,
} from "../../domain/cost.ts";

/**
 * Upsert, nunca borra: si un modelo desaparece de la página (retirado),
 * su uso histórico conserva el último precio conocido en vez de pasar a 0.
 */
export function savePrices(
  db: DatabaseSync,
  table: PriceTable,
  fetchedAt: string,
): void {
  const upsert = db.prepare(`
    INSERT INTO model_prices (
      model, input, output, cache_write_5m, cache_write_1h, cache_read, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (model) DO UPDATE SET
      input = excluded.input,
      output = excluded.output,
      cache_write_5m = excluded.cache_write_5m,
      cache_write_1h = excluded.cache_write_1h,
      cache_read = excluded.cache_read,
      fetched_at = excluded.fetched_at
  `);
  db.exec("BEGIN");
  try {
    for (const [model, p] of Object.entries(table)) {
      upsert.run(
        model,
        p.input,
        p.output,
        p.cacheWrite,
        p.cacheWrite1h,
        p.cacheRead,
        fetchedAt,
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export interface CurrentPrices {
  prices: PriceTable;
  /** YYYY-MM-DD de la última descarga buena, o la de la semilla. */
  updatedAt: string;
}

/** La semilla, con lo descargado encima. */
export function currentPrices(db: DatabaseSync): CurrentPrices {
  const rows = db
    .prepare(`
      SELECT model, input, output, cache_write_5m AS cacheWrite,
        cache_write_1h AS cacheWrite1h, cache_read AS cacheRead, fetched_at AS fetchedAt
      FROM model_prices
    `)
    .all() as {
    model: string;
    input: number;
    output: number;
    cacheWrite: number;
    cacheWrite1h: number;
    cacheRead: number;
    fetchedAt: string;
  }[];

  const prices: PriceTable = { ...SEED_PRICES };
  let latest: string | null = null;
  for (const { model, fetchedAt, ...p } of rows) {
    prices[model] = p;
    if (!latest || fetchedAt > latest) latest = fetchedAt;
  }
  return { prices, updatedAt: latest ? latest.slice(0, 10) : SEED_PRICES_DATE };
}
