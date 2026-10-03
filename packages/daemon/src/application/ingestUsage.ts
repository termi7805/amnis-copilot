import type {
  IngestResult,
  Provider,
  ProviderUsageEvent,
  UsageStore,
} from "../domain/Provider.ts";

export type { IngestResult };

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
  parseLine(line: string): ProviderUsageEvent | null;
  /** `true` si se insertó; `false` si `dedupe_key` ya existía. */
  insertUsageEvent(event: ProviderUsageEvent): boolean;
}

/**
 * Todo lo que `runIngest` necesita de fuera. Nada de `node:sqlite` aquí:
 * abrir la BD, borrar lo derivado y la transacción son detalles de
 * `infrastructure/cli/ingest.ts`.
 */
export interface RunIngestDeps {
  providers: readonly Provider[];
  /**
   * `rebuild` pide un store que **actualiza** los eventos que ya existen en
   * vez de ignorarlos (ver `insertUsageEvent`).
   */
  openStore(options: { rebuild: boolean }): {
    store: UsageStore;
    /**
     * Olvida los offsets de ingesta para releer todos los JSONL. No borra
     * eventos: Claude Code purga transcripts viejos, y el uso de los que ya
     * no existen no se puede reconstruir de ningún sitio.
     */
    resetOffsets(): void;
    /** Ejecuta `fn` en una transacción: si lanza, no se aplica nada. */
    transaction<T>(fn: () => T): T;
    close(): void;
  };
}

export interface RunIngestOptions {
  rebuild: boolean;
}

/**
 * `amnis ingest` / `amnis ingest --rebuild`.
 *
 * `--rebuild` es el botón que hace barato equivocarse en el parseo: relee todos
 * los JSONL que sigan en disco y **corrige** lo que ya había, sin borrar nada
 * (los JSONL son la fuente de verdad solo mientras Claude Code no los purgue).
 * Reinicio de offsets y reingesta se **aplican** en una transacción: si falla,
 * ni los offsets ni los eventos cambian.
 *
 * Leer y parsear los JSONL es lo que tarda (~18 s con 850 MB); escribir en
 * SQLite, no. Con el daemon vivo (#90), una transacción que abarcara la lectura
 * retendría el write lock todo ese tiempo y el daemon se bloquearía en cada
 * escritura. Por eso el rebuild lee **fuera** de la transacción contra un
 * store que solo anota lo que se escribiría, y la transacción lo reproduce
 * sobre el store real: el lock dura lo que dura la escritura.
 */
export function runIngest(
  deps: RunIngestDeps,
  options: RunIngestOptions,
): IngestResult {
  const { store, resetOffsets, transaction, close } = deps.openStore({
    rebuild: options.rebuild,
  });
  try {
    if (!options.rebuild) return ingestAllProviders(deps.providers, store);

    const recorder = createRecordingStore();
    const read = ingestAllProviders(deps.providers, recorder.store);
    return transaction(() => {
      resetOffsets();
      const written = recorder.replayInto(store);
      return {
        filesScanned: read.filesScanned,
        linesRead: read.linesRead,
        eventsInserted: written.eventsInserted,
        duplicatesSkipped: written.duplicatesSkipped,
      };
    });
  } finally {
    close();
  }
}

/**
 * `UsageStore` que no escribe: anota las llamadas en orden. Sus offsets
 * siempre están "reseteados" (`getOffset` → `undefined`), que es lo que
 * `resetOffsets()` hace en la BD, así que los providers releen todo.
 */
function createRecordingStore(): {
  store: UsageStore;
  replayInto(target: UsageStore): {
    eventsInserted: number;
    duplicatesSkipped: number;
  };
} {
  const calls: Array<(target: UsageStore) => boolean | null> = [];
  return {
    store: {
      getOffset: () => undefined,
      saveOffset(filePath, size, offset) {
        calls.push((target) => {
          target.saveOffset(filePath, size, offset);
          return null;
        });
      },
      insertUsageEvent(providerId, event) {
        calls.push((target) => target.insertUsageEvent(providerId, event));
        // El resultado real lo da la reproducción; aquí no se sabe.
        return true;
      },
    },
    replayInto(target) {
      let eventsInserted = 0;
      let duplicatesSkipped = 0;
      for (const call of calls) {
        const inserted = call(target);
        if (inserted === true) eventsInserted++;
        else if (inserted === false) duplicatesSkipped++;
      }
      return { eventsInserted, duplicatesSkipped };
    },
  };
}

/** Recorre el registro de providers y suma sus resultados de ingesta. */
export function ingestAllProviders(
  providers: readonly Provider[],
  store: UsageStore,
): IngestResult {
  const total: IngestResult = {
    filesScanned: 0,
    linesRead: 0,
    eventsInserted: 0,
    duplicatesSkipped: 0,
  };

  for (const provider of providers) {
    const result = provider.ingestHistorical(store);
    total.filesScanned += result.filesScanned;
    total.linesRead += result.linesRead;
    total.eventsInserted += result.eventsInserted;
    total.duplicatesSkipped += result.duplicatesSkipped;
  }
  return total;
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
