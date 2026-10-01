import type { MediaSnapshot, MediaStatus } from "@amnis/shared";
import { deriveVibe } from "../../../domain/vibe.ts";
import { loadSpotifyToken } from "./session.ts";

const PLAYER_URL =
  "https://api.spotify.com/v1/me/player?additional_types=episode";
/** Spotify no publica sus límites; sin `Retry-After`, esperar un minuto. */
const DEFAULT_RETRY_AFTER_MS = 60_000;

/** `Retry-After` de un 429 en ms; sin cabecera válida, un minuto. */
export function retryAfterMsFrom(response: Response): number {
  const seconds = Number(response.headers.get("Retry-After"));
  return Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000
    : DEFAULT_RETRY_AFTER_MS;
}

export interface MediaReading {
  snapshot: MediaSnapshot;
  /** Solo en un 429: lo que Spotify pidió esperar. */
  retryAfterMs?: number;
}

/** Snapshot sin datos: todo estado que no es "ok" comparte esta forma. */
export function emptyMedia(
  status: MediaStatus,
  measuredAt: string,
): MediaSnapshot {
  return {
    status,
    isPlaying: false,
    track: null,
    progressMs: 0,
    measuredAt,
    shuffle: false,
    repeat: "off",
    device: null,
    vibe: "neutral",
    bpm: null,
  };
}

interface SpotifyImage {
  url?: string;
}

interface SpotifyPlayerBody {
  is_playing?: boolean;
  progress_ms?: number | null;
  shuffle_state?: boolean;
  repeat_state?: string;
  device?: { id?: string | null; name?: string; type?: string } | null;
  item?: {
    id?: string;
    name?: string;
    duration_ms?: number;
    artists?: { name?: string }[];
    album?: { name?: string; images?: SpotifyImage[] };
    show?: { name?: string; images?: SpotifyImage[] };
    images?: SpotifyImage[];
  } | null;
}

function toRepeat(value: string | undefined): "off" | "context" | "track" {
  return value === "context" || value === "track" ? value : "off";
}

/** Mapeo puro de `GET /v1/me/player`. Un episodio usa el programa como artista. */
export function toMediaSnapshot(
  body: SpotifyPlayerBody,
  measuredAt: string,
): MediaSnapshot {
  const item = body.item;
  const isEpisode = item?.show !== undefined;
  const artists = isEpisode
    ? [item?.show?.name ?? ""]
    : (item?.artists ?? []).map((a) => a.name ?? "");
  const images = isEpisode
    ? (item?.images ?? item?.show?.images)
    : item?.album?.images;
  return {
    status: "ok",
    isPlaying: body.is_playing === true,
    track: item
      ? {
          id: item.id ?? "",
          title: item.name ?? "",
          artists: artists.filter((a) => a !== ""),
          album: isEpisode ? "" : (item.album?.name ?? ""),
          imageUrl: images?.[0]?.url ?? null,
          durationMs: item.duration_ms ?? 0,
        }
      : null,
    progressMs: body.progress_ms ?? 0,
    measuredAt,
    shuffle: body.shuffle_state === true,
    repeat: toRepeat(body.repeat_state),
    device: body.device
      ? {
          id: body.device.id ?? null,
          name: body.device.name ?? "",
          type: body.device.type ?? "",
        }
      : null,
    // Un episodio es `podcast` sin consultar a nadie; una pista queda
    // `neutral` hasta que el poller le pone la de ReccoBeats.
    vibe: deriveVibe(null, isEpisode ? "episode" : "track"),
    bpm: null,
  };
}

/**
 * Una lectura de `GET /v1/me/player`. 204 = nada activo; 429 respeta
 * `Retry-After`; el resto de fallos (401, 5xx, red) degradan a
 * `unavailable` — nunca se devuelve el snapshot anterior como si fuera
 * actual.
 */
export async function fetchPlayer(
  accessToken: string,
  now: Date,
): Promise<MediaReading> {
  const measuredAt = now.toISOString();
  let response: Response;
  try {
    response = await fetch(PLAYER_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { snapshot: emptyMedia("unavailable", measuredAt) };
  }

  if (response.status === 204) {
    return { snapshot: emptyMedia("no-device", measuredAt) };
  }
  if (response.status === 429) {
    return {
      snapshot: emptyMedia("unavailable", measuredAt),
      retryAfterMs: retryAfterMsFrom(response),
    };
  }
  if (!response.ok) {
    return { snapshot: emptyMedia("unavailable", measuredAt) };
  }

  try {
    return {
      snapshot: toMediaSnapshot(
        (await response.json()) as SpotifyPlayerBody,
        measuredAt,
      ),
    };
  } catch {
    return { snapshot: emptyMedia("unavailable", measuredAt) };
  }
}

/** Sin token no se toca la red: `not-configured` o `not-logged-in`. */
export async function readMedia(
  now: Date = new Date(),
  loadToken: typeof loadSpotifyToken = loadSpotifyToken,
): Promise<MediaReading> {
  const token = await loadToken({ now });
  const measuredAt = now.toISOString();
  if (!token.ok) {
    const status: MediaStatus =
      token.reason === "no-client-id"
        ? "not-configured"
        : token.reason === "not-logged-in"
          ? "not-logged-in"
          : "unavailable";
    return { snapshot: emptyMedia(status, measuredAt) };
  }
  return fetchPlayer(token.accessToken, now);
}
