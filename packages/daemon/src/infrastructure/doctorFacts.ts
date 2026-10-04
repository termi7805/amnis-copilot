import type { DatabaseSync } from "node:sqlite";
import type { DaemonMessage } from "@amnis/shared";
import type {
  AutoIngestFacts,
  DiagnoseFacts,
} from "../application/diagnose.ts";
import {
  EXPECTED_HOOK_EVENTS,
  isAmnisMatcher,
} from "../application/installHooks.ts";
import { CLAUDE_SETTINGS, DB_PATH, SPOTIFY_REDIRECT_URI } from "../config.ts";
import { readSettings } from "./claudeSettings.ts";
import { openDb } from "./persistence/db.ts";
import { lastIngestAt } from "./persistence/ingestOffsets.ts";
import {
  readSpotifyConfig,
  readSpotifyToken,
} from "./persistence/spotifyToken.ts";
import { readCredentials } from "./providers/anthropic/credentials.ts";

/**
 * Lo que cada puerta aporta por su cuenta (#89): el CLI y el daemon saben
 * cosas distintas sobre sí mismos. El resto de la recogida es común, para
 * que `amnis doctor` y `GET /api/health` nunca den diagnósticos distintos.
 */
export interface DoctorFactsDeps {
  /** CLI: sondea el puerto. Daemon: trivialmente `true`. */
  daemonAlive(): Promise<boolean>;
  /** CLI: un poll en vivo. Daemon: el último error del poller, en memoria. */
  quotaError(): Promise<DaemonMessage | null>;
  /** Daemon: cómo fue su última ingesta automática (#98). El CLI no la tiene. */
  autoIngest?(): AutoIngestFacts;
  /** Conexión ya abierta (daemon). Sin ella se abre y cierra `DB_PATH`. */
  db?: DatabaseSync;
}

function amnisHookEvents(): string[] {
  const settings = readSettings(CLAUDE_SETTINGS);
  const hooks = settings.hooks ?? {};
  return Object.entries(hooks)
    .filter(
      ([, matchers]) =>
        Array.isArray(matchers) && matchers.some(isAmnisMatcher),
    )
    .map(([event]) => event);
}

function credentialsFacts(): DiagnoseFacts["credentials"] {
  const result = readCredentials();
  if (!result.ok) return { ok: false, message: result.message };
  return {
    ok: true,
    expiresAt: result.token.expiresAt,
  };
}

function dbFacts(shared?: DatabaseSync): {
  error: string | null;
  lastIngest: Date | null;
} {
  try {
    const db = shared ?? openDb(DB_PATH);
    try {
      return { error: null, lastIngest: lastIngestAt(db) };
    } finally {
      if (!shared) db.close();
    }
  } catch (err) {
    return { error: (err as Error).message, lastIngest: null };
  }
}

/** Solo lee ficheros: un diagnóstico no refresca el token que diagnostica. */
function spotifyFacts(now: Date): DiagnoseFacts["spotify"] {
  const token = readSpotifyToken();
  return {
    hasClientId: readSpotifyConfig() !== null,
    token: !token
      ? "none"
      : now.getTime() < token.expiresAt
        ? "valid"
        : "expired-refreshable",
    redirectUri: SPOTIFY_REDIRECT_URI,
  };
}

export async function gatherDiagnoseFacts(
  deps: DoctorFactsDeps,
  now: Date,
): Promise<DiagnoseFacts> {
  const [daemonAlive, quotaError] = await Promise.all([
    deps.daemonAlive(),
    deps.quotaError(),
  ]);
  const { error: dbError, lastIngest } = dbFacts(deps.db);
  return {
    daemonAlive,
    amnisHookEvents: amnisHookEvents(),
    expectedHookEvents: EXPECTED_HOOK_EVENTS,
    credentials: credentialsFacts(),
    quotaError,
    dbError,
    lastIngestAt: lastIngest,
    ...(deps.autoIngest && { autoIngest: deps.autoIngest() }),
    spotify: spotifyFacts(now),
  };
}
