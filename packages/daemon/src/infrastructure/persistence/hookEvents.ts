import type { DatabaseSync } from "node:sqlite";

export interface HookEventRecord {
  accountId: number;
  provider: string;
  ts: string;
  hook: string;
  toolName: string | null;
  sessionId: string | null;
  project: string | null;
  derivedState: string;
}

export function insertHookEvent(
  db: DatabaseSync,
  event: HookEventRecord,
): void {
  db.prepare(`
    INSERT INTO hook_events (
      account_id, provider, ts, hook, tool_name, session_id, project, derived_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.accountId,
    event.provider,
    event.ts,
    event.hook,
    event.toolName,
    event.sessionId,
    event.project,
    event.derivedState,
  );
}

export interface LastKnownStateEvent {
  hook: string;
  toolName: string | null;
  derivedState: string;
  ts: string;
}

/**
 * El evento más reciente con un estado reconocible. `derived_state =
 * 'unknown'` (hooks que `derivePetState` no supo mapear) no cuenta: no es
 * información sobre qué estás haciendo, es ruido — para GET /api/state (#26).
 */
export function lastKnownStateEvent(
  db: DatabaseSync,
  accountId: number,
): LastKnownStateEvent | null {
  const row = db
    .prepare(`
      SELECT hook, tool_name, derived_state, ts FROM hook_events
      WHERE account_id = ? AND derived_state != 'unknown'
      ORDER BY ts DESC LIMIT 1
    `)
    .get(accountId) as
    | {
        hook: string;
        tool_name: string | null;
        derived_state: string;
        ts: string;
      }
    | undefined;
  if (!row) return null;
  return {
    hook: row.hook,
    toolName: row.tool_name,
    derivedState: row.derived_state,
    ts: row.ts,
  };
}

export function countHookEvents(db: DatabaseSync, accountId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM hook_events WHERE account_id = ?")
    .get(accountId) as { n: number };
  return row.n;
}
