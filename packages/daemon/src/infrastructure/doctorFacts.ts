import type { DatabaseSync } from "node:sqlite";
import type { DiagnoseFacts } from "../application/diagnose.ts";
import { CLAUDE_SETTINGS, DB_PATH, SPOTIFY_REDIRECT_URI } from "../config.ts";
import { isAmnisMatcher, readSettings } from "./claudeSettings.ts";
import { openDb } from "./persistence/db.ts";
import { lastIngestAt } from "./persistence/ingestOffsets.ts";
import {
  readSpotifyConfig,
  readSpotifyToken,
} from "./persistence/spotifyToken.ts";
import { readCredentials } from "./providers/anthropic/credentials.ts";

const EXPECTED_HOOK_EVENTS = ["PreToolUse", "Notification", "Stop"];

/**
 * Lo que cada puerta aporta por su cuenta (#89): el CLI y el daemon saben
 * cosas distintas sobre sí mismos. El resto de la recogida es común, para
 * que `amnis doctor` y `GET /api/health` nunca den diagnósticos distintos.
 */
export interface DoctorFactsDeps {
  /** CLI: sondea el puerto. Daemon: trivialmente `true`. */
  daemonAlive(): Promise<boolean>;
  /** CLI: un poll en vivo. Daemon: el último error del poller, en memoria. */
  quotaError(): Promise<string | null>;
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

/** `loadToken()` refrescaría el token como efecto secundario; un
 * diagnóstico no debe cambiar lo que diagnostica. */
function credentialsFacts(): DiagnoseFacts["credentials"] {
  const result = readCredentials();
  if (!result.ok) return { ok: false, message: result.message };
  return {
    ok: true,
    expiresAt: result.token.expiresAt,
    hasRefreshToken: result.token.refreshToken !== null,
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
    spotify: spotifyFacts(now),
  };
}
