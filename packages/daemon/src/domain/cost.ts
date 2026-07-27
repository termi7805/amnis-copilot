/**
 * Coste equivalente de API, nunca "gastado": en una tarifa plana el coste
 * por token no existe. Lo único que responde a una pregunta real —¿me
 * compensa la suscripción?— es cuánto habría costado ese consumo pagando
 * la API pública.
 *
 * USD por millón de tokens. La tabla envejece: PRICES_UPDATED_AT registra
 * cuándo se actualizó por última vez, no es un dato que se pueda inferir
 * del código.
 */
export const PRICES_UPDATED_AT = "2026-07-27";

export interface ModelPrices {
  /** $/millón de tokens */
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export const PRICES: Record<string, ModelPrices> = {
  "claude-fable-5": {
    input: 10.0,
    output: 50.0,
    cacheWrite: 12.5,
    cacheRead: 1.0,
  },
  "claude-opus-5": {
    input: 5.0,
    output: 25.0,
    cacheWrite: 6.25,
    cacheRead: 0.5,
  },
  "claude-opus-4-8": {
    input: 5.0,
    output: 25.0,
    cacheWrite: 6.25,
    cacheRead: 0.5,
  },
  "claude-sonnet-5": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
};

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
 * un coste falso es peor que un hueco visible.
 */
export function apiEquivalent(usage: TokenUsage): number {
  const prices = usage.model ? PRICES[usage.model] : undefined;
  if (!prices) return 0;

  return (
    (usage.inputTokens * prices.input +
      usage.outputTokens * prices.output +
      usage.cacheCreationTokens * prices.cacheWrite +
      usage.cacheReadTokens * prices.cacheRead) /
    1_000_000
  );
}
