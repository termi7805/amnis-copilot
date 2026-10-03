import type { DatabaseSync } from "node:sqlite";
import {
  apiEquivalent,
  isPriced,
  normalizeModelId,
  type PriceTable,
} from "../../domain/cost.ts";

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

/** `day,model` cruza las dos dimensiones en el propio SQL: la gráfica de coste
 * por día y modelo no puede salir de cruzar dos respuestas en el cliente,
 * que no cuadra en los días con modelos sin precio. */
export type UsageGroupBy =
  | "day"
  | "project"
  | "model"
  | "session"
  | "day,model";

export interface AggregateOptions {
  groupBy: UsageGroupBy;
  from?: Date;
  to?: Date;
}

export interface UsageAggregateRow {
  key: string;
  /** Solo con `groupBy=day,model`: el modelo sin sufijo de fecha, `""` si el
   * evento no lo tenía. `key` es entonces el día. */
  model?: string;
  /** Sesiones distintas con eventos en el grupo. */
  sessions: number;
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
  session: "COALESCE(session_id, '')",
  "day,model": "date(ts)",
};

/**
 * Agrega desde los eventos crudos, nunca desde una tabla de rollups: cambiar
 * la fórmula de coste (domain/cost.ts) no debe obligar a reingerir nada.
 *
 * El coste no se puede sumar sobre tokens ya agrupados por día/proyecto —
 * un grupo puede mezclar modelos con precios distintos. Se agrega primero
 * por (grupo, modelo) en SQL, y el coste por modelo se combina en JS.
 *
 * Por modelo, la clave va sin sufijo de fecha (`claude-haiku-4-5-20251001`
 * → `claude-haiku-4-5`): es el mismo modelo, y con y sin fecha saldría
 * en dos filas.
 */
export function aggregate(
  db: DatabaseSync,
  accountId: number,
  options: AggregateOptions,
  prices: PriceTable,
): UsageAggregate {
  const keyExpr = GROUP_KEY_SQL[options.groupBy];
  const byDayModel = options.groupBy === "day,model";
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
    const model = byDayModel ? normalizeModelId(row.model ?? "") : undefined;
    const key =
      options.groupBy === "model" ? normalizeModelId(row.key) : row.key;
    const bucket = byDayModel ? `${key}\u0000${model}` : key;
    const acc = byKey.get(bucket) ?? {
      key,
      ...(byDayModel ? { model } : {}),
      sessions: 0,
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
    byKey.set(bucket, acc);
  }

  // Las sesiones se cuentan aparte y con un Set por fila: una sesión que usa
  // dos modelos (o el mismo con y sin sufijo de fecha) es una sola, y sumar
  // COUNT(DISTINCT) por modelo la contaría dos veces.
  const sessionRows = db
    .prepare(`
      SELECT DISTINCT ${keyExpr} AS key, model, session_id AS sessionId
      FROM usage_events
      WHERE ${conditions.join(" AND ")} AND session_id IS NOT NULL
    `)
    .all(...params) as {
    key: string;
    model: string | null;
    sessionId: string;
  }[];
  const sessionSets = new Map<string, Set<string>>();
  for (const row of sessionRows) {
    const key =
      options.groupBy === "model" ? normalizeModelId(row.key) : row.key;
    const bucket = byDayModel
      ? `${key}\u0000${normalizeModelId(row.model ?? "")}`
      : key;
    const set = sessionSets.get(bucket) ?? new Set<string>();
    set.add(row.sessionId);
    sessionSets.set(bucket, set);
  }
  for (const [bucket, acc] of byKey) {
    acc.sessions = sessionSets.get(bucket)?.size ?? 0;
  }

  return {
    rows: [...byKey.values()].sort(
      (a, b) =>
        a.key.localeCompare(b.key) ||
        (a.model ?? "").localeCompare(b.model ?? ""),
    ),
    unpricedModels: [...unpriced].sort(),
  };
}

/**
 * La última rama de git vista por sesión en el rango. Las filas sin rama
 * (transcripts anteriores a `--rebuild`) no cuentan: una rama vieja gana a un
 * `null`.
 */
export function branchesBySession(
  db: DatabaseSync,
  accountId: number,
  from: Date,
  to: Date,
): Map<string, string> {
  const rows = db
    .prepare(`
      SELECT session_id, git_branch FROM usage_events
      WHERE account_id = ? AND ts >= ? AND ts < ?
        AND session_id IS NOT NULL AND git_branch IS NOT NULL
      ORDER BY ts ASC
    `)
    .all(accountId, from.toISOString(), to.toISOString()) as {
    session_id: string;
    git_branch: string;
  }[];
  return new Map(rows.map((r) => [r.session_id, r.git_branch]));
}
