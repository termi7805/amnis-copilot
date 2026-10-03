import type { DatabaseSync } from "node:sqlite";

export interface UsageEventRecord {
  accountId: number;
  provider: string;
  dedupeKey: string;
  sessionId: string | null;
  project: string | null;
  gitBranch: string | null;
  ts: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  serviceTier: string | null;
}

const INSERT_COLUMNS = `
  account_id, provider, dedupe_key, session_id, project, ts, model,
  input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
  service_tier, git_branch`;

/**
 * Inserta un evento de uso. Devuelve `false` si `dedupe_key` ya existía
 * (el UNIQUE de la tabla lo rechazó: es una línea repetida del mismo
 * message.id, otro bloque de contenido).
 *
 * Con `replace` (`amnis ingest --rebuild`), un `dedupe_key` existente se
 * **actualiza** con lo que acaba de parsearse en vez de ignorarse: así un
 * cambio de parseo corrige las filas, sin borrar las de transcripts que
 * Claude Code ya ha purgado y que nadie puede reingerir. Sigue devolviendo
 * `false` para una fila que ya existía.
 */
export function insertUsageEvent(
  db: DatabaseSync,
  event: UsageEventRecord,
  options: { replace?: boolean } = {},
): boolean {
  const values = [
    event.accountId,
    event.provider,
    event.dedupeKey,
    event.sessionId,
    event.project,
    event.ts,
    event.model,
    event.inputTokens,
    event.outputTokens,
    event.cacheCreationTokens,
    event.cacheReadTokens,
    event.serviceTier,
    event.gitBranch,
  ];
  const placeholders = values.map(() => "?").join(", ");

  if (!options.replace) {
    const info = db
      .prepare(
        `INSERT OR IGNORE INTO usage_events (${INSERT_COLUMNS}) VALUES (${placeholders})`,
      )
      .run(...values);
    return info.changes > 0;
  }

  const existed =
    db
      .prepare("SELECT 1 FROM usage_events WHERE dedupe_key = ?")
      .get(event.dedupeKey) !== undefined;
  db.prepare(
    `INSERT INTO usage_events (${INSERT_COLUMNS}) VALUES (${placeholders})
     ON CONFLICT(dedupe_key) DO UPDATE SET
       session_id = excluded.session_id,
       project = excluded.project,
       ts = excluded.ts,
       model = excluded.model,
       input_tokens = excluded.input_tokens,
       output_tokens = excluded.output_tokens,
       cache_creation_tokens = excluded.cache_creation_tokens,
       cache_read_tokens = excluded.cache_read_tokens,
       service_tier = excluded.service_tier,
       git_branch = excluded.git_branch`,
  ).run(...values);
  return !existed;
}

export function countUsageEvents(db: DatabaseSync, accountId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM usage_events WHERE account_id = ?")
    .get(accountId) as { n: number };
  return row.n;
}
