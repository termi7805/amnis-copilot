import type { DatabaseSync } from "node:sqlite";

export interface QuotaSampleRecord {
  accountId: number;
  ts: string;
  fiveHourUtil: number | null;
  fiveHourResetsAt: string | null;
  sevenDayUtil: number | null;
  sevenDayResetsAt: string | null;
  opusUtil: number | null;
  localTokens: number;
  localUtil: number;
  source: "both" | "local";
  error: string | null;
}

export function insertQuotaSample(
  db: DatabaseSync,
  sample: QuotaSampleRecord,
): void {
  db.prepare(`
    INSERT INTO quota_samples (
      account_id, ts, five_hour_util, five_hour_resets_at,
      seven_day_util, seven_day_resets_at, opus_util,
      local_tokens, local_util, source, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sample.accountId,
    sample.ts,
    sample.fiveHourUtil,
    sample.fiveHourResetsAt,
    sample.sevenDayUtil,
    sample.sevenDayResetsAt,
    sample.opusUtil,
    sample.localTokens,
    sample.localUtil,
    sample.source,
    sample.error,
  );
}

/**
 * El `five_hour_resets_at` no nulo más reciente: la vía "sin endpoint" de
 * inferir el inicio de la ventana actual (DESIGN.md §2) cuando la muestra
 * de ahora mismo no trae autoritativo pero una anterior sí lo trajo.
 */
export function lastKnownReset(
  db: DatabaseSync,
  accountId: number,
): string | null {
  const row = db
    .prepare(`
      SELECT five_hour_resets_at FROM quota_samples
      WHERE account_id = ? AND five_hour_resets_at IS NOT NULL
      ORDER BY ts DESC LIMIT 1
    `)
    .get(accountId) as { five_hour_resets_at: string } | undefined;
  return row?.five_hour_resets_at ?? null;
}
