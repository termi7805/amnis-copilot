export interface IngestResult {
  filesScanned: number;
  linesRead: number;
  eventsInserted: number;
  duplicatesSkipped: number;
}

export interface ParsedUsageEvent {
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
 * Todo lo que `ingestAll` necesita de fuera, sin saber si viene de
 * transcripts de Claude Code o de otro provider, ni de qué motor de
 * persistencia. `infrastructure/` construye esto e inyecta.
 */
export interface IngestUsageDeps {
  findTranscripts(): string[];
  statSize(path: string): number | null;
  readChunk(path: string, offset: number, length: number): string;
  getOffset(filePath: string): { size: number; offset: number } | undefined;
  saveOffset(filePath: string, size: number, offset: number): void;
  parseLine(line: string): ParsedUsageEvent | null;
  /** `true` si se insertó; `false` si `dedupe_key` ya existía. */
  insertUsageEvent(event: ParsedUsageEvent): boolean;
}

/**
 * Ingesta incremental de los transcripts de uso.
 *
 * Al arrancar reingiere todo lo escrito mientras el daemon estaba apagado:
 * por eso "el daemon vive con la mascota" no pierde datos de uso.
 */
export function ingestAll(deps: IngestUsageDeps): IngestResult {
  const result: IngestResult = {
    filesScanned: 0,
    linesRead: 0,
    eventsInserted: 0,
    duplicatesSkipped: 0,
  };

  for (const file of deps.findTranscripts()) {
    ingestFile(deps, file, result);
  }
  return result;
}

function ingestFile(
  deps: IngestUsageDeps,
  path: string,
  result: IngestResult,
): void {
  const size = deps.statSize(path);
  if (size === null) return;

  const prev = deps.getOffset(path);

  // Si el fichero encogió, fue reescrito: se relee entero.
  const offset = prev && size >= prev.size ? prev.offset : 0;
  if (offset >= size) return;

  result.filesScanned++;
  const chunk = deps.readChunk(path, offset, size - offset);

  // La última línea puede estar incompleta (el provider escribiendo ahora
  // mismo): se deja fuera y su offset se procesa en la siguiente pasada.
  const lastNewline = chunk.lastIndexOf("\n");
  if (lastNewline === -1) return;
  const consumed = chunk.slice(0, lastNewline + 1);

  for (const line of consumed.split("\n")) {
    if (!line.trim()) continue;
    result.linesRead++;

    const event = deps.parseLine(line);
    if (!event) continue;

    if (deps.insertUsageEvent(event)) result.eventsInserted++;
    else result.duplicatesSkipped++;
  }

  deps.saveOffset(path, size, offset + Buffer.byteLength(consumed));
}
