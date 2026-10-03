import type { DatabaseSync } from "node:sqlite";
import type { CeilingWindow } from "../../domain/localQuota.ts";

/**
 * `resets_at` trae jitter de microsegundos (`15:50:00.030191`,
 * `15:49:59.637`): agrupar por la cadena exacta partiría una misma ventana en
 * trece. Se redondea al minuto más cercano.
 */
export function normalizeWindowEnd(iso: string): string {
  const minute = 60_000;
  const ms = Math.round(new Date(iso).getTime() / minute) * minute;
  return new Date(ms).toISOString();
}

/**
 * Una fila por ventana. La última muestra válida de la ventana gana (es la de
 * mayor utilización), así que se reescribe mientras la ventana sigue abierta.
 */
export function saveWindowCeiling(
  db: DatabaseSync,
  accountId: number,
  plan: string,
  window: CeilingWindow & { windowEnd: string },
): void {
  db.prepare(`
    INSERT INTO window_ceilings (account_id, plan, window_end, tokens, utilization)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (account_id, window_end)
    DO UPDATE SET plan = excluded.plan, tokens = excluded.tokens,
                  utilization = excluded.utilization
  `).run(
    accountId,
    plan,
    normalizeWindowEnd(window.windowEnd),
    window.tokens,
    window.utilization,
  );
}

/**
 * Las últimas `limit` ventanas ya cerradas (`window_end ≤ now`) del plan
 * vigente. Otro plan no vale: el historial de Pro no dice nada de Max.
 */
export function closedWindowCeilings(
  db: DatabaseSync,
  accountId: number,
  plan: string,
  now: Date,
  limit: number,
): CeilingWindow[] {
  const rows = db
    .prepare(`
      SELECT tokens, utilization FROM window_ceilings
      WHERE account_id = ? AND plan = ? AND window_end <= ?
      ORDER BY window_end DESC LIMIT ?
    `)
    .all(
      accountId,
      plan,
      now.toISOString(),
      limit,
    ) as unknown as CeilingWindow[];
  return rows.map((r) => ({ tokens: r.tokens, utilization: r.utilization }));
}
