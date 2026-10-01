import type { Vibe } from "@amnis/shared";
import { deriveVibe } from "../domain/vibe.ts";
import type { FeaturesResult } from "./providers/reccobeats/features.ts";

export interface TrackVibe {
  vibe: Vibe;
  bpm: number | null;
}

export interface TrackVibes {
  /** Lo que ya está en caché, sin red; lo marca como reciente. */
  peek(id: string): TrackVibe | undefined;
  /** Nunca rechaza: ante cualquier fallo, `neutral`. */
  resolve(id: string): Promise<TrackVibe>;
}

export interface TrackVibesDeps {
  fetchFeatures(id: string): Promise<FeaturesResult>;
  maxEntries?: number;
}

const NEUTRAL: TrackVibe = { vibe: "neutral", bpm: null };

/**
 * Vibe y BPM por ID de pista, con caché LRU **en memoria** (nada en SQLite:
 * misma regla que el resto de datos de Spotify en E8). Una consulta por
 * canción.
 *
 * Se cachea un acierto y también "fuera de catálogo" (neutral): preguntar
 * de nuevo no cambiaría la respuesta. **No** se cachea un fallo transitorio
 * (timeout, 429, 5xx, red): la próxima vez que suene esa canción se
 * reintenta.
 */
export function createTrackVibes(deps: TrackVibesDeps): TrackVibes {
  const maxEntries = deps.maxEntries ?? 200;
  // Un `Map` conserva el orden de inserción: reinsertar en cada acierto deja
  // el menos reciente el primero, que es el que se desaloja.
  const cache = new Map<string, TrackVibe>();
  const inFlight = new Map<string, Promise<TrackVibe>>();

  function remember(id: string, value: TrackVibe): void {
    cache.delete(id);
    cache.set(id, value);
    if (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }

  function peek(id: string): TrackVibe | undefined {
    const hit = cache.get(id);
    if (hit) remember(id, hit);
    return hit;
  }

  return {
    peek,
    resolve(id) {
      const cached = peek(id);
      if (cached) return Promise.resolve(cached);
      const pending = inFlight.get(id);
      if (pending) return pending;

      const run = deps
        .fetchFeatures(id)
        .then((result): TrackVibe => {
          if (!result.ok) return NEUTRAL;
          const value: TrackVibe = result.features
            ? {
                vibe: deriveVibe(result.features, "track"),
                bpm: result.features.bpm,
              }
            : NEUTRAL;
          // Cachea antes de resolver: una lectura del poller que se cruce
          // con este resultado lo encuentra ya con `peek`.
          remember(id, value);
          return value;
        })
        .catch(() => NEUTRAL)
        .finally(() => {
          inFlight.delete(id);
        });
      inFlight.set(id, run);
      return run;
    },
  };
}
