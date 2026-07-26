/**
 * ⚠️ Endpoint no documentado. `TOKEN_URL` y `DEFAULT_CLIENT_ID` proceden de
 * strings de configuración encontrados en el binario instalado de Claude
 * Code (~/.local/share/claude), no de documentación oficial de Anthropic.
 * `grant_type=refresh_token` está confirmado; la codificación exacta del
 * body NO — se implementa como JSON (como el resto de la API pública) por
 * ser la opción más consistente, pero podría ser
 * `application/x-www-form-urlencoded`. Por eso la construcción de la
 * petición vive aislada en `buildRefreshRequest`, sin mezclar con la
 * orquestación de `credentials.ts`: corregirlo, si hace falta, es cambiar
 * esta función y nada más.
 */
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const DEFAULT_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

export interface RefreshRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
}

export function buildRefreshRequest(
  refreshToken: string,
  clientId: string = process.env.AMNIS_ANTHROPIC_OAUTH_CLIENT_ID ??
    DEFAULT_CLIENT_ID,
): RefreshRequest {
  return {
    url: TOKEN_URL,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  };
}

export type RefreshOutcome =
  | { ok: true; accessToken: string; refreshToken: string; expiresAt: number }
  | { ok: false; permanent: boolean; message: string };

/**
 * `permanent: true` en HTTP 401 (refresh_token inválido o rotado): quien
 * llama debe dejar de insistir. `permanent: false` en error de red o 5xx:
 * transitorio, seguro reintentar en el siguiente poll.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId?: string,
): Promise<RefreshOutcome> {
  const req = buildRefreshRequest(refreshToken, clientId);

  let response: Response;
  try {
    response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
  } catch (err) {
    return {
      ok: false,
      permanent: false,
      message: `Fallo de red al refrescar el token: ${(err as Error).message}.`,
    };
  }

  if (response.status === 401) {
    return {
      ok: false,
      permanent: true,
      message: "El refresh token fue rechazado (401): ya no es válido.",
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      permanent: false,
      message: `El endpoint de refresh respondió ${response.status}.`,
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      ok: false,
      permanent: false,
      message: "Respuesta de refresh no es JSON válido.",
    };
  }

  const parsed = data as Record<string, unknown>;
  const accessToken = parsed.access_token;
  const newRefreshToken = parsed.refresh_token;
  const expiresIn = parsed.expires_in;
  if (
    typeof accessToken !== "string" ||
    typeof newRefreshToken !== "string" ||
    typeof expiresIn !== "number"
  ) {
    return {
      ok: false,
      permanent: false,
      message: "Respuesta de refresh con forma inesperada.",
    };
  }

  return {
    ok: true,
    accessToken,
    refreshToken: newRefreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}
