import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { SPOTIFY_CONFIG_PATH, SPOTIFY_TOKEN_PATH } from "../../config.ts";

export interface SpotifyConfig {
  clientId: string;
}

export interface SpotifyToken {
  accessToken: string;
  refreshToken: string;
  /** epoch ms, como el token de Anthropic. */
  expiresAt: number;
  scope: string;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Permisos 0600: `mode` solo aplica al crear, chmod cubre el fichero previo. */
function writeJson0600(path: string, value: unknown): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function readSpotifyConfig(
  path: string = SPOTIFY_CONFIG_PATH,
): SpotifyConfig | null {
  const config = readJson<SpotifyConfig>(path);
  return typeof config?.clientId === "string" && config.clientId.length > 0
    ? config
    : null;
}

export function writeSpotifyConfig(
  config: SpotifyConfig,
  path: string = SPOTIFY_CONFIG_PATH,
): void {
  writeJson0600(path, config);
}

export function readSpotifyToken(
  path: string = SPOTIFY_TOKEN_PATH,
): SpotifyToken | null {
  const token = readJson<SpotifyToken>(path);
  return typeof token?.accessToken === "string" &&
    typeof token.refreshToken === "string" &&
    typeof token.expiresAt === "number"
    ? token
    : null;
}

export function writeSpotifyToken(
  token: SpotifyToken,
  path: string = SPOTIFY_TOKEN_PATH,
): void {
  writeJson0600(path, token);
}

export function deleteSpotifyToken(path: string = SPOTIFY_TOKEN_PATH): void {
  rmSync(path, { force: true });
}
