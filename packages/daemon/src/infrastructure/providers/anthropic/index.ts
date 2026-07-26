import type { NormalizedHookEvent } from "@amnis/shared";
import { ingestAll } from "../../../application/ingestUsage.ts";
import type {
  IngestResult,
  Provider,
  QuotaReading,
  UsageStore,
} from "../../../domain/Provider.ts";
import {
  findTranscripts,
  parseUsageLine,
  readTranscriptChunk,
  statTranscriptSize,
} from "./transcripts.ts";

const ID = "anthropic" as const;

function ingestHistorical(store: UsageStore): IngestResult {
  return ingestAll({
    findTranscripts,
    statSize: statTranscriptSize,
    readChunk: readTranscriptChunk,
    getOffset: (filePath) => store.getOffset(filePath),
    saveOffset: (filePath, size, offset) =>
      store.saveOffset(filePath, size, offset),
    parseLine: parseUsageLine,
    // El id es el del provider, nunca un literal que escriba el llamador.
    insertUsageEvent: (event) => store.insertUsageEvent(ID, event),
  });
}

/**
 * El endpoint OAuth de cuota es #14. Hasta entonces, degradar es el
 * comportamiento normal (DESIGN.md §2), no un stub a rellenar.
 */
async function pollQuota(): Promise<QuotaReading> {
  return {
    authoritative: null,
    error: "pollQuota() no implementado todavía (#14)",
  };
}

/**
 * Mapea el payload de hook de Claude Code. `null` si no reconoce la forma:
 * quien reciba esto decide qué hacer con un evento no normalizable.
 */
function normalizeHookEvent(raw: unknown): NormalizedHookEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const payload = raw as Record<string, unknown>;

  const hook = payload.hook_event_name;
  if (typeof hook !== "string") return null;

  return {
    provider: ID,
    hook,
    toolName: typeof payload.tool_name === "string" ? payload.tool_name : null,
    sessionId:
      typeof payload.session_id === "string" ? payload.session_id : null,
    project: typeof payload.cwd === "string" ? payload.cwd : null,
    permissionMode:
      typeof payload.permission_mode === "string"
        ? payload.permission_mode
        : null,
    command: typeof payload.command === "string" ? payload.command : null,
    at: new Date().toISOString(),
  };
}

export const anthropicProvider: Provider = {
  id: ID,
  ingestHistorical,
  pollQuota,
  normalizeHookEvent,
};
