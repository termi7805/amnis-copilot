import { SPOTIFY_CONFIG_PATH, SPOTIFY_TOKEN_PATH } from "../../../config.ts";
import {
  deleteSpotifyToken,
  readSpotifyConfig,
  readSpotifyToken,
  writeSpotifyToken,
} from "../../persistence/spotifyToken.ts";
import { refreshSpotifyToken, type SpotifyTokenOutcome } from "./oauth.ts";

/** Margen para no entregar un token que caduca en mitad de la petición. */
const EXPIRY_MARGIN_MS = 60_000;

export type LoadSpotifyTokenResult =
  | { ok: true; accessToken: string }
  | {
      ok: false;
      reason: "no-client-id" | "not-logged-in" | "refresh-failed";
      message: string;
    };

export interface LoadSpotifyTokenOptions {
  now?: Date;
  /** Refrescar aunque el token parezca vigente: un 401 con token "vigente"
   * significa que Spotify lo invalidó (revocado, rotado). */
  force?: boolean;
  tokenPath?: string;
  configPath?: string;
  refreshFn?: (
    clientId: string,
    refreshToken: string,
  ) => Promise<SpotifyTokenOutcome>;
}

// Spotify puede rotar el refresh token: dos refrescos concurrentes (estado y
// control pedirán token a la vez) harían que el segundo usara uno ya
// invalidado.
let inFlight: Promise<LoadSpotifyTokenResult> | null = null;

/**
 * Token de Spotify listo para usar, refrescándolo si hace falta. Lee de
 * disco en cada llamada: sobrevive a reinicios del daemon y a `logout`
 * sin estado en memoria que sincronizar.
 */
export function loadSpotifyToken(
  opts: LoadSpotifyTokenOptions = {},
): Promise<LoadSpotifyTokenResult> {
  if (inFlight) return inFlight;
  const run = doLoad(opts).finally(() => {
    inFlight = null;
  });
  inFlight = run;
  return run;
}

async function doLoad(
  opts: LoadSpotifyTokenOptions,
): Promise<LoadSpotifyTokenResult> {
  const tokenPath = opts.tokenPath ?? SPOTIFY_TOKEN_PATH;
  const config = readSpotifyConfig(opts.configPath ?? SPOTIFY_CONFIG_PATH);
  if (!config) {
    return {
      ok: false,
      reason: "no-client-id",
      message: "Falta el Client ID de Spotify.",
    };
  }
  const token = readSpotifyToken(tokenPath);
  if (!token) {
    return {
      ok: false,
      reason: "not-logged-in",
      message: "Sin sesión de Spotify.",
    };
  }

  const now = (opts.now ?? new Date()).getTime();
  if (!opts.force && now + EXPIRY_MARGIN_MS < token.expiresAt) {
    return { ok: true, accessToken: token.accessToken };
  }

  const outcome = await (opts.refreshFn ?? refreshSpotifyToken)(
    config.clientId,
    token.refreshToken,
  );
  if (outcome.ok) {
    writeSpotifyToken(
      {
        accessToken: outcome.accessToken,
        refreshToken: outcome.refreshToken,
        expiresAt: outcome.expiresAt,
        scope: outcome.scope,
      },
      tokenPath,
    );
    return { ok: true, accessToken: outcome.accessToken };
  }
  if (outcome.permanent) {
    // Refresh token muerto: volver a "sin sesión" para que la UI ofrezca
    // Conectar en vez de reintentar un token que ya no sirve.
    deleteSpotifyToken(tokenPath);
    return {
      ok: false,
      reason: "not-logged-in",
      message: `La sesión de Spotify ya no es válida: ${outcome.message}`,
    };
  }
  return { ok: false, reason: "refresh-failed", message: outcome.message };
}
