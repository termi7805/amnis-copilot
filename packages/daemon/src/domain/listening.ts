import type { Listening, MediaSnapshot } from "@amnis/shared";

/** Sin sonar este tiempo, `listening` se apaga: saltar de canción o pausar un
 * momento no debe hacer parpadear el accesorio. */
export const LISTENING_GRACE_MS = 15_000;

export interface ListeningMemory {
  listening: Listening | null;
  /** Última vez (ms) que se observó sonando, o `null` si nunca. */
  heardAt: number | null;
  /** Si la última observación sonaba. */
  playing: boolean;
}

export const NO_LISTENING: ListeningMemory = {
  listening: null,
  heardAt: null,
  playing: false,
};

/**
 * Eje `listening` del `PetSnapshot` (#59). Ortogonal al estado: no lo toca ni
 * lo despierta, y un evento de Spotify no es actividad. Puro, con el reloj por
 * parámetro. `media` ya trae vibe y BPM compuestos (#63).
 *
 * La gracia cuenta desde la pausa: si la observación anterior sonaba, se oyó
 * hasta ahora mismo, no hasta el último check.
 */
export function deriveListening(
  prev: ListeningMemory,
  media: MediaSnapshot | null,
  now: Date,
): ListeningMemory {
  const at = now.getTime();

  if (media?.status === "ok" && media.isPlaying && media.track) {
    return {
      listening: {
        vibe: media.vibe,
        bpm: media.bpm,
        track: {
          id: media.track.id,
          title: media.track.title,
          artist: media.track.artists.join(", "),
          imageUrl: media.track.imageUrl,
        },
      },
      heardAt: at,
      playing: true,
    };
  }

  const heardAt = prev.playing ? at : prev.heardAt;
  const inGrace = heardAt !== null && at - heardAt < LISTENING_GRACE_MS;
  return {
    listening: inGrace ? prev.listening : null,
    heardAt,
    playing: false,
  };
}
