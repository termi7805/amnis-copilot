import type { PriceTable } from "../domain/cost.ts";

export interface RefreshPricesDeps {
  fetchPrices(): Promise<{ prices: PriceTable } | { error: string }>;
  savePrices(prices: PriceTable, fetchedAt: string): void;
}

/**
 * Nunca sustituye una tabla buena por una peor: si la descarga o el
 * parseo fallan no se guarda nada y siguen valiendo los últimos precios.
 */
export async function refreshPrices(
  deps: RefreshPricesDeps,
  now: Date,
): Promise<{ error: string | null }> {
  const reading = await deps.fetchPrices();
  if ("error" in reading) return { error: reading.error };
  deps.savePrices(reading.prices, now.toISOString());
  return { error: null };
}
