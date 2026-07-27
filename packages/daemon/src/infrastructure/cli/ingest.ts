import { rmSync } from "node:fs";
import {
  type RunIngestDeps,
  runIngest,
} from "../../application/ingestUsage.ts";
import { DB_PATH } from "../../config.ts";
import type { IngestResult } from "../../domain/Provider.ts";
import { ensureAccount } from "../persistence/accounts.ts";
import { openDb } from "../persistence/db.ts";
import { createUsageStore } from "../persistence/usageStore.ts";
import { providers } from "../providers/index.ts";

function makeDeps(): RunIngestDeps {
  return {
    providers,
    resetDatabase() {
      rmSync(DB_PATH, { force: true });
    },
    openStore() {
      const db = openDb(DB_PATH);
      // MVP: una sola cuenta activa por provider (accounts.ts).
      const accountId = ensureAccount(db, "anthropic", "default");
      return {
        store: createUsageStore(db, accountId),
        close: () => db.close(),
      };
    },
  };
}

function formatResult(result: IngestResult, ms: number): string {
  return [
    `Ficheros escaneados: ${result.filesScanned}`,
    `Líneas leídas:       ${result.linesRead}`,
    `Eventos insertados:  ${result.eventsInserted}`,
    `Duplicados omitidos: ${result.duplicatesSkipped}`,
    `Tiempo:              ${ms} ms`,
  ].join("\n");
}

export function runIngestCli(argv: readonly string[]): void {
  const rebuild = argv.includes("--rebuild");
  const start = performance.now();
  const result = runIngest(makeDeps(), { rebuild });
  const ms = Math.round(performance.now() - start);

  if (rebuild) console.log("BD reconstruida desde cero.\n");
  console.log(formatResult(result, ms));
}
