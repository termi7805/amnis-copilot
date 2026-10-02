import type { Listening, Vibe } from "@amnis/shared";
import { useEffect, useState } from "react";
import type { ScreenMode } from "./useNowPlaying.ts";

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

const TEAL = "#39E0C8";

/**
 * Preferencias de la capa de música de la mascota. El tipo y su persistencia
 * son del daemon (#65); hasta entonces `<Pet>` usa estos valores por defecto.
 */
export interface MusicPrefs {
  /** Interruptor general: apagado, Amnis no lleva nada de la capa. */
  enabled: boolean;
  /** Qué se mueve: la cabeza además del accesorio, o solo el accesorio. */
  motion: "head" | "accessory";
  /** 0–1: cuánto reduce la fatiga la amplitud del movimiento. */
  damping: number;
  color: "vibe" | "cover" | "teal";
  /** Sin datos de ReccoBeats: notas neutras, o solo los cascos. */
  fallback: "neutral" | "quiet";
  /** Qué enseña la pantalla de Amnis al cambiar de canción (#64). */
  screen: ScreenMode;
  /** Cuánto dura en pantalla, en segundos. */
  screenSeconds: number;
  screenEntry: "tv" | "fade";
  /** Líneas de pantalla sobre la portada. */
  scanlines: boolean;
}

export const DEFAULT_MUSIC_PREFS: MusicPrefs = {
  enabled: true,
  motion: "head",
  damping: 0.7,
  color: "vibe",
  fallback: "neutral",
  screen: "two-phase",
  screenSeconds: 4,
  screenEntry: "tv",
  scanlines: true,
};

/** Pulso por defecto de las vibes sin BPM (podcast, sin datos): no se usa, el
 * CSS lleva su ritmo fijo, pero la variable no puede quedar sin valor. */
const FALLBACK_BEAT_S = 0.48;

/** `--beat`: segundos por pulso. Acotado para que un BPM absurdo (el doble o
 * la mitad del real, algo habitual) no dé una animación imposible. */
export function beatSeconds(bpm: number | null): number {
  if (bpm === null || !Number.isFinite(bpm) || bpm <= 0) return FALLBACK_BEAT_S;
  return 60 / Math.min(200, Math.max(50, bpm));
}

/** `--amp`: `1 − nivel de fatiga × amortiguación`. Cambia cuánto se mueve,
 * nunca la velocidad (docs/DESIGN.md §4). */
export function amplitude(fatigueLevel: number, damping: number): number {
  const d = Math.min(1, Math.max(0, damping));
  return 1 - fatigueLevel * d;
}

/** `cover` usa el color de la portada si se pudo leer (canvas y CORS del CDN
 * de Spotify, `useCoverArt`); si no, cae a la vibe. */
export function layerColor(
  vibe: Vibe,
  color: MusicPrefs["color"],
  coverColor: string | null = null,
): string {
  if (color === "teal") return TEAL;
  if (color === "cover" && coverColor) return coverColor;
  return VIBE_COLOR[vibe];
}

/** Lo que dura el fade-out de los cascos antes de desmontarlos. */
export const LAYER_EXIT_MS = 350;

/**
 * Mantiene la capa montada un momento al salir para que se vea el fundido, y
 * recuerda la última pista para no perder la vibe mientras tanto. Con
 * `hold: false` (`waiting`, `limited`, interruptor apagado) se va ya.
 */
export function useLayerPresence(
  listening: Listening | null,
  hold: boolean,
  holdMs = LAYER_EXIT_MS,
): { shown: Listening | null; visible: boolean } {
  const [held, setHeld] = useState<Listening | null>(listening);
  const [entered, setEntered] = useState(false);

  // Derivado en el render: la última pista conocida, para el fundido.
  if (listening !== null && held !== listening) setHeld(listening);

  const present = listening !== null;
  useEffect(() => {
    if (present) {
      // Montar con `visible: false` y pasar a `true` en el frame siguiente
      // es lo que hace correr la transición de entrada.
      const frame = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    setEntered(false);
    if (!hold) {
      setHeld(null);
      return;
    }
    const timer = setTimeout(() => setHeld(null), holdMs);
    return () => clearTimeout(timer);
  }, [present, hold, holdMs]);

  return {
    shown: listening ?? (hold ? held : null),
    visible: present && entered,
  };
}
