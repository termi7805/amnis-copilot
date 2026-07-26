import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { CLAUDE_PROJECTS_DIR } from "./config.ts";

export interface IngestResult {
  filesScanned: number;
  linesRead: number;
  eventsInserted: number;
  duplicatesSkipped: number;
}

/**
 * Ingesta incremental de los transcripts de Claude Code.
 *
 * Al arrancar reingiere todo lo escrito mientras el daemon estaba apagado:
 * por eso "el daemon vive con la mascota" no pierde datos de uso.
 */
export function ingestAll(db: DatabaseSync, accountId: number): IngestResult {
  const result: IngestResult = {
    filesScanned: 0,
    linesRead: 0,
    eventsInserted: 0,
    duplicatesSkipped: 0,
  };

  for (const file of findTranscripts()) {
    ingestFile(db, accountId, file, result);
  }
  return result;
}

function findTranscripts(): string[] {
  let projectDirs: string[];
  try {
    projectDirs = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(CLAUDE_PROJECTS_DIR, d.name));
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const dir of projectDirs) {
    try {
      for (const name of readdirSync(dir)) {
        if (name.endsWith(".jsonl")) files.push(join(dir, name));
      }
    } catch {
      // Directorio ilegible: se ignora, no es fatal.
    }
  }
  return files;
}

function ingestFile(
  db: DatabaseSync,
  accountId: number,
  path: string,
  result: IngestResult,
): void {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return;
  }

  const prev = db
    .prepare("SELECT size, offset FROM ingest_offsets WHERE file_path = ?")
    .get(path) as { size: number; offset: number } | undefined;

  // Si el fichero encogió, fue reescrito: se relee entero.
  const offset = prev && size >= prev.size ? prev.offset : 0;
  if (offset >= size) return;

  result.filesScanned++;
  const chunk = readFrom(path, offset, size - offset);

  // La última línea puede estar incompleta (Claude Code escribiendo ahora
  // mismo): se deja fuera y su offset se procesa en la siguiente pasada.
  const lastNewline = chunk.lastIndexOf("\n");
  if (lastNewline === -1) return;
  const consumed = chunk.slice(0, lastNewline + 1);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO usage_events (
      account_id, provider, dedupe_key, session_id, project, ts, model,
      input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
      service_tier
    ) VALUES (?, 'anthropic', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const line of consumed.split("\n")) {
    if (!line.trim()) continue;
    result.linesRead++;

    const event = parseUsageLine(line);
    if (!event) continue;

    const info = insert.run(
      accountId,
      event.dedupeKey,
      event.sessionId,
      event.project,
      event.ts,
      event.model,
      event.inputTokens,
      event.outputTokens,
      event.cacheCreationTokens,
      event.cacheReadTokens,
      event.serviceTier,
    );
    // changes === 0 => el UNIQUE de dedupe_key lo rechazó: es una línea
    // repetida del mismo message.id (otro bloque de contenido).
    if (info.changes > 0) result.eventsInserted++;
    else result.duplicatesSkipped++;
  }

  db.prepare(
    `INSERT INTO ingest_offsets (file_path, size, offset, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (file_path) DO UPDATE SET
       size = excluded.size, offset = excluded.offset,
       updated_at = excluded.updated_at`,
  ).run(path, size, offset + Buffer.byteLength(consumed));
}

function readFrom(path: string, offset: number, length: number): string {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.allocUnsafe(length);
    const read = readSync(fd, buf, 0, length, offset);
    return buf.subarray(0, read).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

interface ParsedUsage {
  dedupeKey: string;
  sessionId: string | null;
  project: string | null;
  ts: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  serviceTier: string | null;
}

/**
 * Extrae el uso de una línea de transcript. Solo metadatos: el contenido
 * del mensaje (prompts, código) nunca se toca.
 *
 * La dedupe_key es message.id, NO uuid: varias líneas comparten message.id
 * repitiendo el mismo objeto usage, una por bloque de contenido. Deduplicar
 * por uuid dobla los tokens (medido: 23 de 53 entradas en un fichero real).
 */
function parseUsageLine(line: string): ParsedUsage | null {
  // biome-ignore lint/suspicious/noExplicitAny: forma cruda del JSONL de Claude Code, sin esquema propio todavía; tiparlo de verdad es #44.
  let entry: any;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }

  if (entry?.type !== "assistant") return null;
  const message = entry.message;
  const usage = message?.usage;
  if (!usage) return null;

  const dedupeKey = message.id ?? entry.requestId ?? entry.uuid;
  if (!dedupeKey) return null;

  return {
    dedupeKey: String(dedupeKey),
    sessionId: entry.sessionId ?? null,
    project: entry.cwd ?? null,
    ts: entry.timestamp ?? new Date().toISOString(),
    model: message.model ?? null,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    serviceTier: usage.service_tier ?? null,
  };
}
