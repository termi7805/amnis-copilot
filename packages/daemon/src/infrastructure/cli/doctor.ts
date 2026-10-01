import { type Check, diagnose } from "../../application/diagnose.ts";
import {
  CLAUDE_SETTINGS,
  DB_PATH,
  PORT,
  SPOTIFY_REDIRECT_URI,
} from "../../config.ts";
import { openDb } from "../persistence/db.ts";
import { lastIngestAt } from "../persistence/ingestOffsets.ts";
import {
  readSpotifyConfig,
  readSpotifyToken,
} from "../persistence/spotifyToken.ts";
import { readCredentials } from "../providers/anthropic/credentials.ts";
import { anthropicProvider } from "../providers/anthropic/index.ts";
import { isAmnisMatcher, readSettings } from "./installHooks.ts";

const EXPECTED_HOOK_EVENTS = ["PreToolUse", "Notification", "Stop"];

/** Cualquier respuesta HTTP prueba que el daemon está vivo; solo el
 * rechazo de red significa caído. Evita depender de una ruta concreta que
 * #26 va a redefinir. */
async function probeDaemon(): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${PORT}/`, {
      signal: AbortSignal.timeout(500),
    });
    return true;
  } catch {
    return false;
  }
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
function credentialsFacts() {
  const result = readCredentials();
  if (!result.ok) return { ok: false as const, message: result.message };
  return {
    ok: true as const,
    expiresAt: result.token.expiresAt,
    hasRefreshToken: result.token.refreshToken !== null,
  };
}

function dbFacts(): { error: string | null; lastIngest: Date | null } {
  try {
    const db = openDb(DB_PATH);
    const lastIngest = lastIngestAt(db);
    db.close();
    return { error: null, lastIngest };
  } catch (err) {
    return { error: (err as Error).message, lastIngest: null };
  }
}

/** Solo lee ficheros: un diagnóstico no refresca el token que diagnostica. */
function spotifyFacts(now: Date) {
  const token = readSpotifyToken();
  return {
    hasClientId: readSpotifyConfig() !== null,
    token: !token
      ? ("none" as const)
      : now.getTime() < token.expiresAt
        ? ("valid" as const)
        : ("expired-refreshable" as const),
    redirectUri: SPOTIFY_REDIRECT_URI,
  };
}

function printCheck(check: Check): void {
  const mark = check.ok ? "✓" : "✗";
  console.log(`${mark} ${check.name}: ${check.message}`);
  if (!check.ok && check.remedy) console.log(`  → ${check.remedy}`);
}

export async function runDoctorCli(): Promise<void> {
  const [daemonAlive, quota] = await Promise.all([
    probeDaemon(),
    anthropicProvider.pollQuota(),
  ]);
  const { error: dbError, lastIngest } = dbFacts();

  const now = new Date();
  const checks = diagnose(
    {
      daemonAlive,
      amnisHookEvents: amnisHookEvents(),
      expectedHookEvents: EXPECTED_HOOK_EVENTS,
      credentials: credentialsFacts(),
      quotaError: quota.error,
      dbError,
      lastIngestAt: lastIngest,
      spotify: spotifyFacts(now),
    },
    now,
  );

  for (const check of checks) printCheck(check);

  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}
