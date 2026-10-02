import type { DatabaseSync } from "node:sqlite";
import type { ProviderId } from "@amnis/shared";
import type { ProviderUsageEvent, UsageStore } from "../../domain/Provider.ts";
import { getOffset, saveOffset } from "./ingestOffsets.ts";
import { insertUsageEvent } from "./usageEvents.ts";

/**
 * Traduce el contrato `UsageStore` del núcleo a `node:sqlite`.
 *
 * Con `replace` (`--rebuild`), la **primera** aparición de cada `dedupe_key` en
 * la pasada actualiza la fila y las siguientes se ignoran: igual que una
 * ingesta desde cero, donde gana la primera línea de un `message.id` repetido.
 * Si ganara la última, `--rebuild` y la ingesta incremental darían totales
 * distintos (las líneas repetidas no siempre traen el mismo `usage`).
 */
export function createUsageStore(
  db: DatabaseSync,
  accountId: number,
  options: { replace?: boolean } = {},
): UsageStore {
  const seen = new Set<string>();
  return {
    getOffset: (filePath) => getOffset(db, filePath),
    saveOffset: (filePath, size, offset) =>
      saveOffset(db, filePath, size, offset),
    insertUsageEvent: (providerId: ProviderId, event: ProviderUsageEvent) => {
      const replace = options.replace === true && !seen.has(event.dedupeKey);
      if (options.replace) seen.add(event.dedupeKey);
      return insertUsageEvent(
        db,
        { accountId, provider: providerId, ...event },
        { replace },
      );
    },
  };
}
