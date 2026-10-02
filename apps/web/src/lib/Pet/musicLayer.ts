import type { Vibe } from "@amnis/shared";

/** Color de la capa de música: solo LED, notas y ondas — nunca el cuerpo ni
 * el objeto de la escena, que siguen diciendo qué hacen los agentes (#60). */
export const VIBE_COLOR: Record<Vibe, string> = {
  fiesta: "#39E0C8",
  intensa: "#F2A23A",
  chill: "#6FD3A8",
  melancolica: "#8FB3D9",
  podcast: "#C4B2F2",
  neutral: "#39E0C8",
};

/**
 * Preferencias de la capa de música de la mascota. El tipo y su persistencia
 * son del daemon (#65); hasta entonces `<Pet>` usa estos valores por defecto.
 */
export interface MusicPrefs {
  /** Interruptor general: apagado, Amnis no lleva nada de la capa. */
  enabled: boolean;
}

export const DEFAULT_MUSIC_PREFS: MusicPrefs = { enabled: true };
