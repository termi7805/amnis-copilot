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
  /** `cwd` del hook que produjo este estado — de dónde leer `HEAD` para
   * el hash real en `pushing` (#47). */
  project: string | null;
  /** `ts` del primer evento de la racha actual en `derivedState` — cuándo
   * se entró de verdad en el estado, no el último evento cualquiera
   * dentro de él (ver comentario de más abajo). */
  stateEnteredAt: string;
}

/**
 * El evento más reciente con un estado reconocible, más cuándo empezó la
 * racha actual en ese estado. `derived_state = 'unknown'` (hooks que
 * `derivePetState` no supo mapear) no cuenta en ninguno de los dos: no es
 * información sobre qué estás haciendo, es ruido — para GET /api/state (#26).
 *
 * `stateEnteredAt` importa porque Claude Code dispara un `PreToolUse` por
 * cada herramienta: sin esto, "cuánto llevas programando" se reiniciaba a
 * cero en cada `Edit` aunque llevaras 20 minutos encadenándolos. Se calcula
 * en JS, no en SQL — con los volúmenes de un daemon local (cientos de
 * eventos, no millones) es más simple de leer que una window function, y
 * el límite de 500 filas acota el coste sin necesitar ser exacto: una
 * racha real de miles de eventos sin un solo estado distinto en medio no
 * pasa en la práctica.
 */
export function lastKnownStateEvent(
  db: DatabaseSync,
  accountId: number,
): LastKnownStateEvent | null {
  const rows = db
    .prepare(`
      SELECT hook, tool_name, derived_state, ts, project FROM hook_events
      WHERE account_id = ? AND derived_state != 'unknown'
      ORDER BY ts DESC
      LIMIT 500
    `)
    .all(accountId) as Array<{
    hook: string;
    tool_name: string | null;
    derived_state: string;
    ts: string;
    project: string | null;
  }>;

  const latest = rows[0];
  if (!latest) return null;

  let stateEnteredAt = latest.ts;
  for (const row of rows) {
    if (row.derived_state !== latest.derived_state) break;
    stateEnteredAt = row.ts;
  }

  return {
    hook: latest.hook,
    toolName: latest.tool_name,
    derivedState: latest.derived_state,
    ts: latest.ts,
    project: latest.project,
    stateEnteredAt,
  };
}

export function countHookEvents(db: DatabaseSync, accountId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM hook_events WHERE account_id = ?")
    .get(accountId) as { n: number };
  return row.n;
}
