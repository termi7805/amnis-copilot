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
