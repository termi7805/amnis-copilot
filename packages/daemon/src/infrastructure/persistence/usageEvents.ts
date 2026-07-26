import type { DatabaseSync } from "node:sqlite";

export interface UsageEventRecord {
  accountId: number;
  provider: string;
  dedupeKey: string;
  sessionId: string | null;
  project: string | null;
  ts: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  serviceTier: string | null;
}

/**
 * Inserta un evento de uso. Devuelve `false` si `dedupe_key` ya existía
 * (el UNIQUE de la tabla lo rechazó: es una línea repetida del mismo
 * message.id, otro bloque de contenido).
 */
export function insertUsageEvent(
  db: DatabaseSync,
  event: UsageEventRecord,
): boolean {
  const info = db
    .prepare(`
      INSERT OR IGNORE INTO usage_events (
        account_id, provider, dedupe_key, session_id, project, ts, model,
        input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
        service_tier
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
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
    );
  return info.changes > 0;
}
