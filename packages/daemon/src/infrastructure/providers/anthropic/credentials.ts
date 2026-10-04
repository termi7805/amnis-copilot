import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { type DaemonMessage, msg } from "@amnis/shared";
import { CLAUDE_CREDENTIALS } from "../../../config.ts";

export interface OAuthToken {
  accessToken: string;
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
      message: DaemonMessage;
    };

const KEYCHAIN_SERVICE = "Claude Code-credentials";
const NO_SESSION_MESSAGE = msg("credentials.noSession");

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
      message: msg("credentials.invalidJson", { source }),
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
      message: msg("credentials.unexpectedShape", { source }),
    };
  }

  return {
    ok: true,
    token: {
      accessToken,
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
      message: msg("credentials.unreadable", {
        path,
        detail: (err as Error).message,
      }),
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

export type FreshTokenResult =
  | { ok: true; token: OAuthToken }
  | {
      ok: false;
      reason: "no-session" | "unreadable" | "malformed" | "expired";
      message: DaemonMessage;
    };

export const EXPIRED_TOKEN_MESSAGE = msg("credentials.expired");

/**
 * `readCredentials()` que descarta un token caducado. Amnis no refresca el
 * token (#136): eso exigiría el client ID de Claude Code y acuñar tokens de
 * la suscripción desde una aplicación ajena, y si Anthropic rota el
 * `refresh_token` al usarlo, le cerraría la sesión a Claude Code. Claude Code
 * lo renueva solo al usarse; hasta entonces no hay `%` real y la estimación
 * local cubre el hueco.
 */
export function readFreshToken(
  opts: ReadCredentialsOptions & { now?: Date } = {},
): FreshTokenResult {
  const result = readCredentials(opts);
  if (!result.ok) return result;
  if (isTokenExpired(result.token, opts.now ?? new Date())) {
    return { ok: false, reason: "expired", message: EXPIRED_TOKEN_MESSAGE };
  }
  return result;
}
