import { VERSION } from "../../../config.ts";

/**
 * ⚠️ Servicio de terceros no oficial: puede cambiar o desaparecer sin aviso,
 * y recibe el ID de cada canción que suena (DESIGN §1 y §6). Acepta el ID de
 * Spotify directamente; una canción fuera de su catálogo responde
 * `200 { content: [] }`, no un 404.
 */
const FEATURES_URL = "https://api.reccobeats.com/v1/audio-features";
const DEFAULT_TIMEOUT_MS = 2_500;
/** IDs base-62 de Spotify. Las pistas locales no lo cumplen. */
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

export interface TrackFeatures {
  /** `null` si ReccoBeats no da un tempo utilizable. */
  bpm: number | null;
  energy: number;
  valence: number;
}

export type FeaturesResult =
  /** `features: null` = fuera de catálogo, o ID no consultable (sin red). */
  { ok: true; features: TrackFeatures | null } | { ok: false; message: string };

export interface FeaturesDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export async function fetchFeatures(
  spotifyTrackId: string,
  deps: FeaturesDeps = {},
): Promise<FeaturesResult> {
  // Pistas locales (id vacío) y cualquier cosa rara: ni petición ni nada
  // dentro de la URL.
  if (!SPOTIFY_ID.test(spotifyTrackId)) return { ok: true, features: null };

  const doFetch = deps.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${FEATURES_URL}?ids=${spotifyTrackId}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": `amnis-copilot/${VERSION}`,
      },
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      ok: false,
      message: `No se pudo contactar con ReccoBeats: ${(err as Error).message}.`,
    };
  }
  if (!response.ok) {
    return { ok: false, message: `ReccoBeats respondió ${response.status}.` };
  }

  let body: { content?: unknown };
  try {
    body = (await response.json()) as { content?: unknown };
  } catch {
    return { ok: false, message: "ReccoBeats no devolvió JSON válido." };
  }
  if (!Array.isArray(body.content)) {
    return { ok: false, message: "Respuesta de ReccoBeats inesperada." };
  }

  const first = body.content[0] as
    | { tempo?: unknown; energy?: unknown; valence?: unknown }
    | undefined;
  if (!first) return { ok: true, features: null };
  if (typeof first.energy !== "number" || typeof first.valence !== "number") {
    return { ok: false, message: "ReccoBeats no trae energía y valencia." };
  }
  return {
    ok: true,
    features: {
      bpm:
        typeof first.tempo === "number" &&
        Number.isFinite(first.tempo) &&
        first.tempo > 0
          ? Math.round(first.tempo)
          : null,
      energy: first.energy,
      valence: first.valence,
    },
  };
}
