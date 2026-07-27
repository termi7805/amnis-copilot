import type { DatabaseSync } from "node:sqlite";

export interface IngestOffset {
  size: number;
  offset: number;
}

export function getOffset(
  db: DatabaseSync,
  filePath: string,
): IngestOffset | undefined {
  return db
    .prepare("SELECT size, offset FROM ingest_offsets WHERE file_path = ?")
    .get(filePath) as IngestOffset | undefined;
}

export function saveOffset(
  db: DatabaseSync,
  filePath: string,
  size: number,
  offset: number,
): void {
  db.prepare(
    `INSERT INTO ingest_offsets (file_path, size, offset, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (file_path) DO UPDATE SET
       size = excluded.size, offset = excluded.offset,
       updated_at = excluded.updated_at`,
  ).run(filePath, size, offset);
}

/** `null` si nunca se ha ingerido nada. Para `amnis doctor` (#35). */
export function lastIngestAt(db: DatabaseSync): Date | null {
  const row = db
    .prepare("SELECT MAX(updated_at) AS ts FROM ingest_offsets")
    .get() as { ts: string | null };
  return row.ts ? new Date(`${row.ts}Z`) : null;
}
