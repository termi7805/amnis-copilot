import type { DatabaseSync } from "node:sqlite";

export interface QuotaSampleRecord {
  accountId: number;
  ts: string;
  fiveHourUtil: number | null;
  fiveHourResetsAt: string | null;
  sevenDayUtil: number | null;
  sevenDayResetsAt: string | null;
  /** `QuotaLimit[]` serializado; `null` si la muestra no trae autoritativo. */
  limitsJson: string | null;
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
      seven_day_util, seven_day_resets_at, limits_json,
      local_tokens, local_util, source, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sample.accountId,
    sample.ts,
    sample.fiveHourUtil,
    sample.fiveHourResetsAt,
    sample.sevenDayUtil,
    sample.sevenDayResetsAt,
    sample.limitsJson,
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

export interface QuotaSampleRow {
  ts: string;
  fiveHourUtil: number | null;
  sevenDayUtil: number | null;
  localUtil: number;
}

/** Las muestras de `[from, to]` por `ts` ascendente. */
export function samplesBetween(
  db: DatabaseSync,
  accountId: number,
  from: Date,
  to: Date,
): QuotaSampleRow[] {
  const rows = db
    .prepare(`
      SELECT ts, five_hour_util, seven_day_util, local_util
      FROM quota_samples
      WHERE account_id = ? AND ts >= ? AND ts <= ?
      ORDER BY ts ASC
    `)
    .all(accountId, from.toISOString(), to.toISOString()) as {
    ts: string;
    five_hour_util: number | null;
    seven_day_util: number | null;
    local_util: number;
  }[];
  return rows.map((r) => ({
    ts: r.ts,
    fiveHourUtil: r.five_hour_util,
    sevenDayUtil: r.seven_day_util,
    localUtil: r.local_util,
  }));
}

/**
 * El pico de `five_hour_util` por día, en UTC con `date(ts)` (como
 * `aggregate()` en `usage.ts`). Solo cuentan las muestras con endpoint: una
 * estimación local no es un pico del `%` real.
 */
export function dailyPeaks(
  db: DatabaseSync,
  accountId: number,
  from: Date,
  to: Date,
): { day: string; peak: number }[] {
  const rows = db
    .prepare(`
      SELECT date(ts) AS day, MAX(five_hour_util) AS peak
      FROM quota_samples
      WHERE account_id = ? AND ts >= ? AND ts <= ?
        AND five_hour_util IS NOT NULL
      GROUP BY day
      ORDER BY day ASC
    `)
    .all(accountId, from.toISOString(), to.toISOString()) as {
    day: string;
    peak: number;
  }[];
  return rows.map((r) => ({ day: r.day, peak: r.peak }));
}
