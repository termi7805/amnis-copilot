/**
 * Coste equivalente de API, nunca "gastado": en una tarifa plana el coste
 * por token no existe. Lo único que responde a una pregunta real —¿me
 * compensa la suscripción?— es cuánto habría costado ese consumo pagando
 * la API pública.
 *
 * USD por millón de tokens. La tabla vigente se descarga de la página de
 * precios oficial (providers/anthropic/pricing.ts) y vive en SQLite;
 * SEED_PRICES es solo la semilla para un primer arranque sin red.
 * SEED_PRICES_DATE registra cuándo se escribió a mano por última vez.
 */
export const SEED_PRICES_DATE = "2026-10-02";

export interface ModelPrices {
  /** $/millón de tokens */
  input: number;
  output: number;
  /** Escritura en la caché de 5 min. */
  cacheWrite: number;
  /** Escritura en la caché de 1 h. Aún no se cobra aparte: la ingesta no
   * separa las dos escrituras (#73). */
  cacheWrite1h: number;
  cacheRead: number;
}

export type PriceTable = Record<string, ModelPrices>;

function prices(
  input: number,
  output: number,
  cacheWrite: number,
  cacheWrite1h: number,
  cacheRead: number,
): ModelPrices {
  return { input, output, cacheWrite, cacheWrite1h, cacheRead };
}

export const SEED_PRICES: PriceTable = {
  "claude-fable-5-1": prices(10, 50, 12.5, 20, 0.25),
  "claude-fable-5": prices(10, 50, 12.5, 20, 1),
  "claude-opus-5-5": prices(4, 20, 5, 8, 0.2),
  "claude-opus-5": prices(5, 25, 6.25, 10, 0.5),
  "claude-opus-4-8": prices(5, 25, 6.25, 10, 0.5),
  "claude-opus-4-7": prices(5, 25, 6.25, 10, 0.5),
  "claude-opus-4-6": prices(5, 25, 6.25, 10, 0.5),
  "claude-opus-4-5": prices(5, 25, 6.25, 10, 0.5),
  "claude-sonnet-5-5": prices(2, 10, 2.5, 4, 0.2),
  "claude-sonnet-5": prices(2, 10, 2.5, 4, 0.2),
  "claude-sonnet-4-6": prices(3, 15, 3.75, 6, 0.3),
  "claude-sonnet-4-5": prices(3, 15, 3.75, 6, 0.3),
  "claude-haiku-4-5": prices(1, 5, 1.25, 2, 0.1),
};

/**
 * Los JSONL traen a veces el ID con fecha (`claude-haiku-4-5-20251001`);
 * la página de precios, nunca. Sin quitarla, Haiku costaría 0.
 */
export function normalizeModelId(id: string): string {
  return id.replace(/-\d{8}$/, "");
}

function pricesFor(
  model: string | null,
  table: PriceTable,
): ModelPrices | undefined {
  return model ? table[normalizeModelId(model)] : undefined;
}

export function isPriced(model: string | null, table: PriceTable): boolean {
  return pricesFor(model, table) !== undefined;
}

export interface TokenUsage {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

/**
 * Los cuatro tipos de token tienen precios distintos y `cacheRead` es
 * ~10x más barato que `input` — sumarlos sin distinguir infla el coste
 * varias veces, el mismo error silencioso que el doble conteo.
 *
 * Modelo desconocido (incluido null) → 0, nunca una estimación inventada:
 * un coste falso es peor que un hueco visible. Visible de verdad: la API
 * lista esos modelos en `unpricedModels`.
 */
export function apiEquivalent(usage: TokenUsage, table: PriceTable): number {
  const p = pricesFor(usage.model, table);
  if (!p) return 0;

  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheCreationTokens * p.cacheWrite +
      usage.cacheReadTokens * p.cacheRead) /
    1_000_000
  );
}
