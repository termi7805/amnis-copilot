import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { CLAUDE_CREDENTIALS, TOKEN_CACHE_PATH } from "../../../config.ts";
import {
  type CachedToken,
  readTokenCache,
  writeTokenCache,
} from "../../persistence/tokenCache.ts";
import { type RefreshOutcome, refreshAccessToken } from "./oauthClient.ts";

export interface OAuthToken {
  accessToken: string;
  refreshToken: string | null;
  /** ⚠️ epoch ms, NO ISO como el resto de timestamps del proyecto. */
  expiresAt: number | null;
  subscriptionType: string | null;
  rateLimitTier: string | null;
  source: "env" | "file" | "keychain";
}

export type CredentialsResult =
  | { ok: true; token: OAuthToken }
  | {
      ok: false;
      reason: "no-session" | "unreadable" | "malformed";
      message: string;
    };

const KEYCHAIN_SERVICE = "Claude Code-credentials";
const NO_SESSION_MESSAGE =
  "No se encontró una sesión de Claude Code. Ejecuta `claude login` e inténtalo de nuevo.";

/** Sin I/O: separado para poder testear la forma del JSON sin tocar disco. */
export function parseCredentialsJson(
  raw: string,
  source: "file" | "keychain",
): CredentialsResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      reason: "malformed",
      message: `El fichero de credenciales no es JSON válido (${source}).`,
    };
  }

  const oauth = (parsed as Record<string, unknown> | null)?.claudeAiOauth as
    | Record<string, unknown>
    | undefined;
  const accessToken = oauth?.accessToken;
  if (!oauth || typeof accessToken !== "string" || accessToken.length === 0) {
    return {
      ok: false,
      reason: "malformed",
      message: `El fichero de credenciales no tiene la forma esperada (claudeAiOauth.accessToken, ${source}).`,
    };
  }

  return {
    ok: true,
    token: {
      accessToken,
      refreshToken:
        typeof oauth.refreshToken === "string" ? oauth.refreshToken : null,
      expiresAt: typeof oauth.expiresAt === "number" ? oauth.expiresAt : null,
      subscriptionType:
        typeof oauth.subscriptionType === "string"
          ? oauth.subscriptionType
          : null,
      rateLimitTier:
        typeof oauth.rateLimitTier === "string" ? oauth.rateLimitTier : null,
      source,
    },
  };
}

export interface ReadCredentialsOptions {
  path?: string;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
}

export function readCredentials(
  opts: ReadCredentialsOptions = {},
): CredentialsResult {
  const path = opts.path ?? CLAUDE_CREDENTIALS;
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;

  const envToken = env.CLAUDE_CODE_OAUTH_TOKEN;
  if (envToken) {
    return {
      ok: true,
      token: {
        accessToken: envToken,
        refreshToken: null,
        expiresAt: null,
        subscriptionType: null,
        rateLimitTier: null,
        source: "env",
      },
    };
  }

  if (platform === "darwin") {
    return readFromKeychain();
  }
  return readFromFile(path);
}

function readFromFile(path: string): CredentialsResult {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { ok: false, reason: "no-session", message: NO_SESSION_MESSAGE };
    }
    return {
      ok: false,
      reason: "unreadable",
      message: `No se pudo leer ${path}: ${(err as Error).message}.`,
    };
  }
  return parseCredentialsJson(raw, "file");
}

function readFromKeychain(): CredentialsResult {
  let raw: string;
  try {
    raw = execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8" },
    );
  } catch {
    return { ok: false, reason: "no-session", message: NO_SESSION_MESSAGE };
  }
  return parseCredentialsJson(raw, "keychain");
}

export function isTokenExpired(token: OAuthToken, now: Date): boolean {
  if (token.expiresAt === null) return false;
  return now.getTime() >= token.expiresAt;
}

export type LoadTokenResult =
  | { ok: true; token: OAuthToken }
  | {
      ok: false;
      reason: "no-session" | "unreadable" | "malformed" | "refresh-failed";
      message: string;
    };

export interface LoadTokenOptions extends ReadCredentialsOptions {
  cachePath?: string;
  now?: Date;
  refreshFn?: (refreshToken: string) => Promise<RefreshOutcome>;
}

function toOAuthToken(
  cached: CachedToken,
  base: Pick<OAuthToken, "subscriptionType" | "rateLimitTier">,
): OAuthToken {
  return {
    accessToken: cached.accessToken,
    refreshToken: cached.refreshToken,
    expiresAt: cached.expiresAt,
    subscriptionType: base.subscriptionType,
    rateLimitTier: base.rateLimitTier,
    source: "file",
  };
}

/**
 * `readCredentials()` + refresco automático cuando hace falta. Implementa
 * el pseudocódigo de DESIGN.md §2: releer el fichero, comprobar mtime,
 * refrescar solo si toca, y nunca escribir en ~/.claude/.
 *
 * Solo actúa sobre credenciales `source: "file"`: un token de entorno no
 * tiene refreshToken, y el Keychain de macOS no tiene un mtime observable
 * en esta forma — queda fuera de alcance, simplificación explícita.
 */
export async function loadToken(
  opts: LoadTokenOptions = {},
): Promise<LoadTokenResult> {
  const credsResult = readCredentials(opts);
  if (!credsResult.ok) return credsResult;
  if (credsResult.token.source !== "file") return credsResult;

  const now = opts.now ?? new Date();
  if (!isTokenExpired(credsResult.token, now)) return credsResult;

  const path = opts.path ?? CLAUDE_CREDENTIALS;
  const cachePath = opts.cachePath ?? TOKEN_CACHE_PATH;
  const refreshFn = opts.refreshFn ?? refreshAccessToken;

  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    // El fichero desapareció entre leerlo y hacerle stat: degradar, no romper.
    return credsResult;
  }

  const cache = readTokenCache(cachePath);
  if (cache && cache.sourceCredentialsMtimeMs === mtimeMs) {
    if (cache.lastPermanentFailureAt !== null) {
      return {
        ok: false,
        reason: "refresh-failed",
        message: `El refresh token fue rechazado (401) y no se reintenta hasta que vuelvas a hacer \`claude login\` (registrado ${cache.lastPermanentFailureAt}).`,
      };
    }
    if (cache.refreshedToken) {
      const cachedToken = toOAuthToken(cache.refreshedToken, credsResult.token);
      if (!isTokenExpired(cachedToken, now)) {
        return { ok: true, token: cachedToken };
      }
    }
  }

  if (!credsResult.token.refreshToken) {
    return {
      ok: false,
      reason: "refresh-failed",
      message:
        "El token caducó y no hay refresh_token disponible para renovarlo.",
    };
  }

  const outcome = await refreshFn(credsResult.token.refreshToken);

  if (outcome.ok) {
    const refreshedToken: CachedToken = {
      accessToken: outcome.accessToken,
      refreshToken: outcome.refreshToken,
      expiresAt: outcome.expiresAt,
    };
    writeTokenCache(
      {
        refreshedToken,
        sourceCredentialsMtimeMs: mtimeMs,
        lastPermanentFailureAt: null,
      },
      cachePath,
    );
    return { ok: true, token: toOAuthToken(refreshedToken, credsResult.token) };
  }

  writeTokenCache(
    {
      refreshedToken: cache?.refreshedToken ?? null,
      sourceCredentialsMtimeMs: mtimeMs,
      lastPermanentFailureAt: outcome.permanent ? now.toISOString() : null,
    },
    cachePath,
  );
  return { ok: false, reason: "refresh-failed", message: outcome.message };
}
