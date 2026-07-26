import type { DatabaseSync } from "node:sqlite";
import type { ProviderId } from "@amnis/shared";
import type { ProviderUsageEvent, UsageStore } from "../../domain/Provider.ts";
import { getOffset, saveOffset } from "./ingestOffsets.ts";
import { insertUsageEvent } from "./usageEvents.ts";

/** Traduce el contrato `UsageStore` del núcleo a `node:sqlite`. */
export function createUsageStore(
  db: DatabaseSync,
  accountId: number,
): UsageStore {
  return {
    getOffset: (filePath) => getOffset(db, filePath),
    saveOffset: (filePath, size, offset) =>
      saveOffset(db, filePath, size, offset),
    insertUsageEvent: (providerId: ProviderId, event: ProviderUsageEvent) =>
      insertUsageEvent(db, { accountId, provider: providerId, ...event }),
  };
}
