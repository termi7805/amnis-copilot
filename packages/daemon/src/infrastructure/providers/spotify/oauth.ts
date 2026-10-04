import { createHash, randomBytes } from "node:crypto";
import { type DaemonMessage, msg } from "@amnis/shared";

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

export const SPOTIFY_SCOPES =
  "user-read-playback-state user-modify-playback-state user-read-currently-playing";

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(64).toString("base64url");
  return { verifier, challenge: challengeFor(verifier) };
}

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: SPOTIFY_SCOPES,
    state: opts.state,
    code_challenge_method: "S256",
    code_challenge: opts.challenge,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export type SpotifyTokenOutcome =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      scope: string;
    }
  | { ok: false; permanent: boolean; message: DaemonMessage };

/**
 * Spotify rechaza un refresh token muerto con 400 `invalid_grant`, no con
 * 401: ese es el único caso `permanent`. Red y 5xx son transitorios.
 */
async function requestToken(
  body: URLSearchParams,
  previousRefreshToken: string | null,
): Promise<SpotifyTokenOutcome> {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    return {
      ok: false,
      permanent: false,
      message: msg("spotify.network", { detail: (err as Error).message }),
    };
  }

  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      permanent: false,
      message: msg("spotify.statusNoJson", { status: response.status }),
    };
  }

  if (!response.ok) {
    const permanent = response.status === 400 && data.error === "invalid_grant";
    const detail =
      typeof data.error_description === "string"
        ? data.error_description
        : String(data.error ?? response.status);
    return {
      ok: false,
      permanent,
      message: msg("spotify.rejected", { status: response.status, detail }),
    };
  }

  const refreshToken =
    typeof data.refresh_token === "string"
      ? data.refresh_token
      : previousRefreshToken;
  if (
    typeof data.access_token !== "string" ||
    typeof data.expires_in !== "number" ||
    refreshToken === null
  ) {
    return {
      ok: false,
      permanent: false,
      message: msg("spotify.unexpectedShape"),
    };
  }
  return {
    ok: true,
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: typeof data.scope === "string" ? data.scope : SPOTIFY_SCOPES,
  };
}

export function exchangeCode(opts: {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<SpotifyTokenOutcome> {
  return requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: opts.code,
      redirect_uri: opts.redirectUri,
      client_id: opts.clientId,
      code_verifier: opts.verifier,
    }),
    null,
  );
}

/** Si Spotify no rota el refresh token, se conserva el anterior. */
export function refreshSpotifyToken(
  clientId: string,
  refreshToken: string,
): Promise<SpotifyTokenOutcome> {
  return requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }),
    refreshToken,
  );
}
