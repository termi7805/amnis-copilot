import type { NormalizedHookEvent } from "@amnis/shared";
import { ingestAll } from "../../../application/ingestUsage.ts";
import type {
  IngestResult,
  Provider,
  QuotaReading,
  UsageStore,
} from "../../../domain/Provider.ts";
import { readFreshToken } from "./credentials.ts";
import { fetchQuota } from "./quota.ts";
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

async function pollQuota(): Promise<QuotaReading> {
  const result = readFreshToken();
  if (!result.ok) {
    return { authoritative: null, error: result.message, rateLimited: false };
  }
  return fetchQuota(result.token.accessToken);
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

  // El comando de Bash viaja en tool_input.command, no en el nivel
  // superior del payload — sin esto `testing` no se dispara nunca.
  const toolInput = payload.tool_input;
  const command =
    typeof toolInput === "object" &&
    toolInput !== null &&
    typeof (toolInput as Record<string, unknown>).command === "string"
      ? ((toolInput as Record<string, unknown>).command as string)
      : null;

  // Solo los hooks de sesión traen un motivo con sentido: `reason` al cerrar,
  // `source` al abrir. Filtrar por hook evita colar campos homónimos de otros.
  const reasonField =
    hook === "SessionEnd"
      ? payload.reason
      : hook === "SessionStart"
        ? payload.source
        : null;

  // Solo `Notification` lo trae: distingue un permiso pendiente del aviso de
  // inactividad, que antes se leía como "esperando permiso".
  const notificationType =
    hook === "Notification" && typeof payload.notification_type === "string"
      ? payload.notification_type
      : null;

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
    command,
    sessionReason: typeof reasonField === "string" ? reasonField : null,
    notificationType,
    at: new Date().toISOString(),
  };
}

export const anthropicProvider: Provider = {
  id: ID,
  ingestHistorical,
  pollQuota,
  normalizeHookEvent,
};
