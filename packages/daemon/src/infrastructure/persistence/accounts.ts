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
