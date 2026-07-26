import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { TOKEN_CACHE_PATH } from "../../config.ts";

export interface CachedToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface TokenCache {
  /** `null` = todavía no hubo un refresco que tuviera éxito. */
  refreshedToken: CachedToken | null;
  /** mtime (ms) de ~/.claude/.credentials.json en el momento del refresco. */
  sourceCredentialsMtimeMs: number;
  /** ISO. `null` = se puede reintentar; no-null = un 401 dijo que no insistiéramos. */
  lastPermanentFailureAt: string | null;
}

export function readTokenCache(
  path: string = TOKEN_CACHE_PATH,
): TokenCache | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as TokenCache;
  } catch {
    return null;
  }
}

/** Permisos 0600: es el token refrescado, nunca compartido con ~/.claude/. */
export function writeTokenCache(
  cache: TokenCache,
  path: string = TOKEN_CACHE_PATH,
): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // `mode` en writeFileSync solo aplica al crear el fichero; si ya existía
  // con otros permisos, chmod explícito es lo único que los garantiza.
  writeFileSync(path, JSON.stringify(cache), { mode: 0o600 });
  chmodSync(path, 0o600);
}
