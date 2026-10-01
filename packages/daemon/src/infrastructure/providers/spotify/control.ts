import type { MediaDeviceOption } from "@amnis/shared";
import { retryAfterMsFrom } from "./player.ts";
import { loadSpotifyToken } from "./session.ts";

const CONTROL_URL = "https://api.spotify.com/v1/me/player";

export type ControlErrorKind =
  | "not-logged-in"
  | "no-device"
  | "forbidden"
  | "rate-limited"
  | "unavailable";

export interface ControlFailure {
  ok: false;
  kind: ControlErrorKind;
  message: string;
  /** Solo en `rate-limited`. */
  retryAfterMs?: number;
}

export type ControlResult = { ok: true } | ControlFailure;

export type DevicesResult =
  | { ok: true; devices: MediaDeviceOption[] }
  | ControlFailure;

export type RepeatMode = "off" | "context" | "track";

/** Todo lo que `routes/media.ts` necesita de Spotify. */
export interface MediaControl {
  play(): Promise<ControlResult>;
  pause(): Promise<ControlResult>;
  next(): Promise<ControlResult>;
  previous(): Promise<ControlResult>;
  seek(positionMs: number): Promise<ControlResult>;
  setShuffle(state: boolean): Promise<ControlResult>;
  setRepeat(mode: RepeatMode): Promise<ControlResult>;
  transfer(deviceId: string): Promise<ControlResult>;
  devices(): Promise<DevicesResult>;
}

export interface ControlDeps {
  fetch?: typeof fetch;
  loadToken?: typeof loadSpotifyToken;
}

interface ControlRequest {
  method: "GET" | "PUT" | "POST";
  path: string;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
}

function failure(
  kind: ControlErrorKind,
  message: string,
  retryAfterMs?: number,
): ControlFailure {
  return retryAfterMs === undefined
    ? { ok: false, kind, message }
    : { ok: false, kind, message, retryAfterMs };
}

/**
 * Traduce un error de Spotify a algo que la UI pueda distinguir. Un 404 solo
 * es `no-device` con `reason: NO_ACTIVE_DEVICE`; un 403 con `PREMIUM_REQUIRED`
 * se explica aparte porque `GET /me` ya no trae `product` y esta es la única
 * forma de saber que la cuenta no es Premium.
 */
async function toControlFailure(response: Response): Promise<ControlFailure> {
  let reason = "";
  let detail = "";
  try {
    const body = (await response.json()) as {
      error?: { reason?: string; message?: string };
    };
    reason = body.error?.reason ?? "";
    detail = body.error?.message ?? "";
  } catch {
    // Spotify no siempre devuelve JSON en un error: el status basta.
  }

  if (response.status === 404 && reason === "NO_ACTIVE_DEVICE") {
    return failure("no-device", "Abre Spotify en algún dispositivo.");
  }
  if (response.status === 403) {
    return failure(
      "forbidden",
      reason === "PREMIUM_REQUIRED"
        ? "Esta acción requiere Spotify Premium."
        : `Spotify no permite esta acción ahora${detail ? `: ${detail}` : "."}`,
    );
  }
  if (response.status === 429) {
    return failure(
      "rate-limited",
      "Spotify pide esperar antes de volver a intentarlo.",
      retryAfterMsFrom(response),
    );
  }
  return failure("unavailable", `Spotify respondió ${response.status}.`);
}

/**
 * Una petición autenticada. Un 401 con token "vigente" quiere decir que
 * Spotify lo invalidó: un refresco forzado y un único reintento; un segundo
 * 401 es `not-logged-in`, sin bucle.
 */
async function sendControl(
  req: ControlRequest,
  deps: ControlDeps,
): Promise<{ ok: true; response: Response } | ControlFailure> {
  const doFetch = deps.fetch ?? fetch;
  const loadToken = deps.loadToken ?? loadSpotifyToken;
  const query = req.query
    ? `?${new URLSearchParams(
        Object.fromEntries(
          Object.entries(req.query).map(([k, v]) => [k, String(v)]),
        ),
      )}`
    : "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await loadToken(attempt === 0 ? {} : { force: true });
    if (!token.ok) {
      return failure(
        token.reason === "refresh-failed" ? "unavailable" : "not-logged-in",
        token.message,
      );
    }
    const hasBody = req.body !== undefined;
    let response: Response;
    try {
      response = await doFetch(`${CONTROL_URL}${req.path}${query}`, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          ...(hasBody && { "Content-Type": "application/json" }),
        },
        body: hasBody ? JSON.stringify(req.body) : undefined,
      });
    } catch {
      return failure("unavailable", "No se pudo contactar con Spotify.");
    }
    if (response.status !== 401) return { ok: true, response };
  }
  return failure("not-logged-in", "La sesión de Spotify ya no es válida.");
}

async function control(
  req: ControlRequest,
  deps: ControlDeps,
): Promise<ControlResult> {
  const sent = await sendControl(req, deps);
  if (!sent.ok) return sent;
  return sent.response.ok ? { ok: true } : toControlFailure(sent.response);
}

interface SpotifyDevicesBody {
  devices?: {
    id?: string | null;
    name?: string;
    type?: string;
    is_active?: boolean;
  }[];
}

export function createMediaControl(deps: ControlDeps = {}): MediaControl {
  return {
    play: () => control({ method: "PUT", path: "/play" }, deps),
    pause: () => control({ method: "PUT", path: "/pause" }, deps),
    next: () => control({ method: "POST", path: "/next" }, deps),
    previous: () => control({ method: "POST", path: "/previous" }, deps),
    seek: (positionMs) =>
      control(
        { method: "PUT", path: "/seek", query: { position_ms: positionMs } },
        deps,
      ),
    setShuffle: (state) =>
      control({ method: "PUT", path: "/shuffle", query: { state } }, deps),
    setRepeat: (mode) =>
      control({ method: "PUT", path: "/repeat", query: { state: mode } }, deps),
    // `play: true`: el usuario espera que la música se mueva, no que se
    // pause al cambiar de dispositivo.
    transfer: (deviceId) =>
      control(
        {
          method: "PUT",
          path: "",
          body: { device_ids: [deviceId], play: true },
        },
        deps,
      ),
    async devices() {
      const sent = await sendControl({ method: "GET", path: "/devices" }, deps);
      if (!sent.ok) return sent;
      if (!sent.response.ok) return toControlFailure(sent.response);
      try {
        const body = (await sent.response.json()) as SpotifyDevicesBody;
        return {
          ok: true,
          devices: (body.devices ?? []).map((d) => ({
            id: d.id ?? null,
            name: d.name ?? "",
            type: d.type ?? "",
            isActive: d.is_active === true,
          })),
        };
      } catch {
        return failure("unavailable", "Respuesta de Spotify no válida.");
      }
    },
  };
}
