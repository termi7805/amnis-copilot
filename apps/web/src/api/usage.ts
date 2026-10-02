import { daemonUrl } from "./config.ts";

/**
 * Réplica del contrato de `packages/daemon/src/infrastructure/persistence/usage.ts`:
 * `/api/usage` no vive en `@amnis/shared` (a diferencia de `StateResponse`),
 * es la primera vez que un cliente lo consume.
 */
export type UsageGroupBy = "day" | "project" | "model";

export interface UsageAggregateRow {
  /** Fecha, proyecto o modelo según `groupBy`. Cadena vacía si el evento no lo tenía. */
  key: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** Equivalente de API, nunca "gastado" — domain/cost.ts. */
  costUsd: number;
}

export interface UsageResponse {
  groupBy: UsageGroupBy;
  /** Fecha de la última descarga buena de la tabla de precios oficial, o
   * la de la semilla de domain/cost.ts si nunca se ha podido descargar. */
  pricesUpdatedAt: string;
  /** Modelos con tokens en el rango y sin precio: su coste cuenta 0. */
  unpricedModels: string[];
  rows: UsageAggregateRow[];
}

export interface FetchUsageParams {
  groupBy: UsageGroupBy;
  from?: Date;
  to?: Date;
}

export async function fetchUsage(
  params: FetchUsageParams,
): Promise<UsageResponse> {
  const query = new URLSearchParams({ groupBy: params.groupBy });
  if (params.from) query.set("from", params.from.toISOString());
  if (params.to) query.set("to", params.to.toISOString());

  const response = await fetch(`${daemonUrl()}/api/usage?${query}`);
  if (!response.ok) {
    throw new Error(`GET /api/usage → ${response.status}`);
  }
  return response.json();
}
