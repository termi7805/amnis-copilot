import type { DatabaseSync } from "node:sqlite";
import type { PetFocus } from "@amnis/shared";
import type { SessionStatus } from "../../domain/petFocus.ts";
import { sleepAfter } from "../../domain/petState.ts";

export interface HookEventRecord {
  accountId: number;
  provider: string;
  ts: string;
  hook: string;
  toolName: string | null;
  sessionId: string | null;
  project: string | null;
  sessionReason: string | null;
  repoRoot: string | null;
  worktree: string | null;
  derivedState: string;
}

export function insertHookEvent(
  db: DatabaseSync,
  event: HookEventRecord,
): void {
  db.prepare(`
    INSERT INTO hook_events (
      account_id, provider, ts, hook, tool_name, session_id, project, session_reason,
      repo_root, worktree, derived_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.accountId,
    event.provider,
    event.ts,
    event.hook,
    event.toolName,
    event.sessionId,
    event.project,
    event.sessionReason,
    event.repoRoot,
    event.worktree,
    event.derivedState,
  );
}

/**
 * El único sitio donde el foco se traduce a SQL (#109). `state`, `since` y
 * `sleeping` salen de las mismas filas, así que filtrar aquí los filtra a la
 * vez. Las columnas `repo_root` / `worktree` / `session_id` llevan índice.
 */
function focusFilter(focus: PetFocus): { clause: string; params: string[] } {
  switch (focus.kind) {
    case "auto":
      return { clause: "", params: [] };
    case "repo":
      return { clause: " AND repo_root = ?", params: [focus.repoRoot] };
    case "worktree":
      return { clause: " AND worktree = ?", params: [focus.worktree] };
    case "session":
      return { clause: " AND session_id = ?", params: [focus.sessionId] };
  }
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
  focus: PetFocus,
): LastKnownStateEvent | null {
  const { clause, params } = focusFilter(focus);
  const rows = db
    .prepare(`
      SELECT hook, tool_name, derived_state, ts, project FROM hook_events
      WHERE account_id = ? AND derived_state != 'unknown'${clause}
      ORDER BY ts DESC
      LIMIT 500
    `)
    .all(accountId, ...params) as Array<{
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

export interface HookEventRow {
  ts: string;
  sessionId: string | null;
  project: string | null;
  derivedState: string;
}

/**
 * Los eventos en `[from, to)` por `ts` ascendente, solo con lo que necesita
 * la vista de Actividad: ni `hook` ni `tool_name` (#87).
 */
export function eventsBetween(
  db: DatabaseSync,
  accountId: number,
  from: Date,
  to: Date,
): HookEventRow[] {
  const rows = db
    .prepare(`
      SELECT ts, session_id, project, derived_state FROM hook_events
      WHERE account_id = ? AND ts >= ? AND ts < ?
      ORDER BY ts ASC
    `)
    .all(accountId, from.toISOString(), to.toISOString()) as Array<{
    ts: string;
    session_id: string | null;
    project: string | null;
    derived_state: string;
  }>;
  return rows.map((r) => ({
    ts: r.ts,
    sessionId: r.session_id,
    project: r.project,
    derivedState: r.derived_state,
  }));
}

export function countHookEvents(db: DatabaseSync, accountId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM hook_events WHERE account_id = ?")
    .get(accountId) as { n: number };
  return row.n;
}

export interface RecentSessionRow {
  sessionId: string;
  startedAt: string;
  lastEventAt: string;
  /** El último `SessionEnd` no ha sido seguido de más actividad. */
  ended: boolean;
  repoRoot: string;
  worktree: string;
  /** Último estado reconocible de la sesión; los hooks de sesión no cuentan. */
  lastState: string | null;
}

/**
 * Las sesiones con algún hook desde `since`, una fila cada una (#107).
 * `startedAt` mira toda la historia de la sesión, no solo desde `since`. Un
 * `SessionStart` posterior al `SessionEnd` (`--resume`) la devuelve a viva.
 * Sin `repo_root` (hooks sin `cwd`) no hay dónde colgarla y se descarta.
 */
export function recentSessions(
  db: DatabaseSync,
  accountId: number,
  since: Date,
): RecentSessionRow[] {
  const rows = db
    .prepare(`
      SELECT
        s.session_id AS session_id,
        s.started_at AS started_at,
        s.last_at AS last_at,
        (SELECT MAX(ts) FROM hook_events e
          WHERE e.account_id = ? AND e.session_id = s.session_id
            AND e.hook = 'SessionEnd') AS ended_at,
        (SELECT repo_root FROM hook_events e
          WHERE e.account_id = ? AND e.session_id = s.session_id
            AND e.repo_root IS NOT NULL AND e.worktree IS NOT NULL
          ORDER BY ts DESC LIMIT 1) AS repo_root,
        (SELECT worktree FROM hook_events e
          WHERE e.account_id = ? AND e.session_id = s.session_id
            AND e.repo_root IS NOT NULL AND e.worktree IS NOT NULL
          ORDER BY ts DESC LIMIT 1) AS worktree,
        (SELECT derived_state FROM hook_events e
          WHERE e.account_id = ? AND e.session_id = s.session_id
            AND e.derived_state != 'unknown'
          ORDER BY ts DESC LIMIT 1) AS last_state
      FROM (
        SELECT session_id, MIN(ts) AS started_at, MAX(ts) AS last_at
        FROM hook_events
        WHERE account_id = ? AND session_id IS NOT NULL
        GROUP BY session_id
        HAVING MAX(ts) >= ?
      ) s
    `)
    .all(
      accountId,
      accountId,
      accountId,
      accountId,
      accountId,
      since.toISOString(),
    ) as Array<{
    session_id: string;
    started_at: string;
    last_at: string;
    ended_at: string | null;
    repo_root: string | null;
    worktree: string | null;
    last_state: string | null;
  }>;
  const out: RecentSessionRow[] = [];
  for (const r of rows) {
    if (!r.repo_root || !r.worktree) continue;
    out.push({
      sessionId: r.session_id,
      startedAt: r.started_at,
      lastEventAt: r.last_at,
      ended: r.ended_at !== null && r.ended_at >= r.last_at,
      repoRoot: r.repo_root,
      worktree: r.worktree,
      lastState: r.last_state,
    });
  }
  return out;
}

/**
 * Cómo está una sesión según su último hook (#110). `ended` si no hay hooks,
 * si lleva más inactiva que la ventana de `alive` (un terminal matado no
 * manda `SessionEnd`) o si su último hook es un `SessionEnd` que no es de un
 * `/clear`; ese es `cleared`. Cualquier hook posterior (`--resume`) la
 * devuelve a `alive`.
 */
export function sessionStatus(
  db: DatabaseSync,
  accountId: number,
  sessionId: string,
  now: Date,
): SessionStatus {
  const last = db
    .prepare(`
      SELECT ts, hook, session_reason FROM hook_events
      WHERE account_id = ? AND session_id = ?
      ORDER BY ts DESC LIMIT 1
    `)
    .get(accountId, sessionId) as
    | { ts: string; hook: string; session_reason: string | null }
    | undefined;
  if (!last || sleepAfter(new Date(last.ts), now)) return "ended";
  if (last.hook !== "SessionEnd") return "alive";
  return last.session_reason === "clear" ? "cleared" : "ended";
}

export interface LiveSessionCandidate {
  sessionId: string;
  lastEventAt: string;
  /** El último `SessionEnd` no ha sido seguido de más actividad. */
  ended: boolean;
  /** `null` si ningún hook de la ventana traía `cwd`. */
  repoRoot: string | null;
  worktree: string | null;
}

/**
 * Las sesiones con algún hook desde `since`, para contar las vivas fuera del
 * foco (#112). Mucho más barata que `recentSessions`: se ejecuta en cada hook,
 * así que lee solo la ventana de inactividad (`idx_hook_ts`) y agrupa en JS.
 * `ended` sigue la misma regla que allí: un `SessionStart` posterior al
 * `SessionEnd` (`--resume`) la devuelve a viva.
 */
export function liveSessionCandidates(
  db: DatabaseSync,
  accountId: number,
  since: Date,
): LiveSessionCandidate[] {
  const rows = db
    .prepare(`
      SELECT session_id, ts, hook, repo_root, worktree FROM hook_events
      WHERE account_id = ? AND ts >= ? AND session_id IS NOT NULL
      ORDER BY ts ASC
    `)
    .all(accountId, since.toISOString()) as Array<{
    session_id: string;
    ts: string;
    hook: string;
    repo_root: string | null;
    worktree: string | null;
  }>;

  const bySession = new Map<
    string,
    LiveSessionCandidate & { endedAt: string | null }
  >();
  for (const r of rows) {
    const s = bySession.get(r.session_id) ?? {
      sessionId: r.session_id,
      lastEventAt: r.ts,
      ended: false,
      repoRoot: null,
      worktree: null,
      endedAt: null,
    };
    s.lastEventAt = r.ts;
    if (r.hook === "SessionEnd") s.endedAt = r.ts;
    if (r.repo_root && r.worktree) {
      s.repoRoot = r.repo_root;
      s.worktree = r.worktree;
    }
    bySession.set(r.session_id, s);
  }
  return [...bySession.values()].map(({ endedAt, ...s }) => ({
    ...s,
    ended: endedAt !== null && endedAt >= s.lastEventAt,
  }));
}
