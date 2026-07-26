import type { DatabaseSync } from "node:sqlite";

/** MVP: una sola cuenta, la activa. El esquema ya soporta varias. */
export function ensureAccount(
  db: DatabaseSync,
  provider: string,
  label: string,
): number {
  db.prepare(
    "INSERT OR IGNORE INTO accounts (provider, label) VALUES (?, ?)",
  ).run(provider, label);
  const row = db
    .prepare("SELECT id FROM accounts WHERE provider = ? AND label = ?")
    .get(provider, label) as { id: number };
  return row.id;
}

/** El techo calibrado (2.4), o `null` si todavía no se ha calibrado. */
export function getPlanWindowTokens(
  db: DatabaseSync,
  accountId: number,
): number | null {
  const row = db
    .prepare("SELECT plan_window_tokens FROM accounts WHERE id = ?")
    .get(accountId) as { plan_window_tokens: number | null } | undefined;
  return row?.plan_window_tokens ?? null;
}

export function savePlanWindowTokens(
  db: DatabaseSync,
  accountId: number,
  tokens: number,
): void {
  db.prepare("UPDATE accounts SET plan_window_tokens = ? WHERE id = ?").run(
    tokens,
    accountId,
  );
}
