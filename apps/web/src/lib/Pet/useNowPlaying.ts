import type { ScreenMode } from "@amnis/shared";
import { useEffect, useRef, useState } from "react";

export type { ScreenMode };

/** Lo que enseña la pantalla en cada momento. */
export type ScreenPhase = "cover" | "cover-title" | "pixel" | "text";

/** En `two-phase`: lo que dura la portada antes de pasar al texto (#60). */
export const COVER_PHASE_MS = 1_200;
/** Lo que tarda en apagarse la pantalla al terminar. */
export const SCREEN_EXIT_MS = 260;

export interface NowPlaying {
  active: boolean;
  phase: ScreenPhase;
  /** Está terminando: la pantalla se apaga antes de volver la cara. */
  closing: boolean;
  /** Duración de la fase de texto, para la marquesina. */
  textSeconds: number;
}

/**
 * Cuándo enseñar la pantalla "sonando" (#64). Dispara cuando **cambia
 * `track.id`**, no en el primer render ni al reconectar con la misma pista; el
 * último id visto se conserva aunque `listening` pase a `null`, así que la
 * misma canción reanudada tras una pausa larga no cuenta como cambio.
 *
 * Con `allowed` falso (`waiting`, `limited`, interruptor apagado) no se
 * enseña y el cambio se da por visto: al volver no reaparece una pantalla
 * vieja. Si ya estaba en pantalla, se corta al instante.
 */
export function useNowPlaying({
  trackId,
  allowed,
  mode,
  seconds,
}: {
  trackId: string | null;
  allowed: boolean;
  mode: ScreenMode;
  seconds: number;
}): NowPlaying {
  const [phase, setPhase] = useState<ScreenPhase | null>(null);
  const [closing, setClosing] = useState(false);
  const lastSeen = useRef<string | null>(trackId);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const live = useRef({ allowed, mode, seconds });
  live.current = { allowed, mode, seconds };

  const clear = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `clear` y los valores en vivo van por ref; solo un cambio de pista dispara
  useEffect(() => {
    if (trackId === null || trackId === lastSeen.current) return;
    lastSeen.current = trackId;
    const { allowed: ok, mode: m, seconds: s } = live.current;
    if (!ok || m === "none") return;

    clear();
    const total = Math.max(s * 1000, COVER_PHASE_MS + 300);
    setClosing(false);
    setPhase(m === "two-phase" ? "cover" : m);
    if (m === "two-phase") {
      timers.current.push(setTimeout(() => setPhase("text"), COVER_PHASE_MS));
    }
    timers.current.push(setTimeout(() => setClosing(true), total));
    timers.current.push(
      setTimeout(() => {
        setPhase(null);
        setClosing(false);
      }, total + SCREEN_EXIT_MS),
    );
  }, [trackId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `clear` solo toca refs
  useEffect(() => {
    if (allowed) return;
    clear();
    setPhase(null);
    setClosing(false);
  }, [allowed]);

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  const total = Math.max(seconds * 1000, COVER_PHASE_MS + 300);
  return {
    active: phase !== null && allowed,
    phase: phase ?? "text",
    closing,
    textSeconds: (mode === "two-phase" ? total - COVER_PHASE_MS : total) / 1000,
  };
}
