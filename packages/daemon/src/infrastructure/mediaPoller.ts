import type { MediaSnapshot } from "@amnis/shared";
import type { MediaReading } from "./providers/spotify/player.ts";

/** Sonando: la canción cambia y la UI se mira. */
export const MEDIA_PLAYING_MS = 3_000;
/** En pausa o sin dispositivo: nada que ver cambia rápido. */
export const MEDIA_IDLE_MS = 30_000;
/** Si el progreso se desvía más de esto del avance natural, fue un seek. */
const SEEK_TOLERANCE_MS = 2_000;

export interface MediaPollerDeps {
  read(now: Date): Promise<MediaReading>;
  hasClients(): boolean;
  onChange(snapshot: MediaSnapshot): void;
  playingMs?: number;
  idleMs?: number;
}

export interface MediaPoller {
  /** Hay un cliente nuevo: arrancar el ciclo si estaba parado. */
  wake(): void;
  /** Leer ya (p. ej. justo tras el login), sin esperar al intervalo. */
  pollNow(): void;
  /**
   * Leer dentro de `delayMs` (500 por defecto): tras una orden de control,
   * Spotify tarda unos cientos de ms en reflejarla en `/me/player`. Sin
   * clientes SSE no hace nada, como el resto del poller.
   */
  pollSoon(delayMs?: number): void;
  /** Último snapshot si es reciente; si no, hace una lectura. */
  snapshot(): Promise<MediaSnapshot>;
  stop(): void;
}

/**
 * Polling adaptativo de Spotify. La mascota está siempre conectada por SSE,
 * así que "consultar solo si alguien mira" acabaría siendo "siempre": el
 * intervalo es lo que lo modula (rápido sonando, lento en pausa) y sin
 * clientes no se programa nada.
 *
 * `setTimeout` encadenado y no `setInterval` porque el intervalo cambia con
 * cada lectura (sonando/pausa/429).
 */
export function startMediaPoller(deps: MediaPollerDeps): MediaPoller {
  const playingMs = deps.playingMs ?? MEDIA_PLAYING_MS;
  const idleMs = deps.idleMs ?? MEDIA_IDLE_MS;

  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<MediaSnapshot> | null = null;
  let last: MediaSnapshot | null = null;
  let lastReadAt = 0;
  let stopped = false;
  // Si llega una orden con una lectura en vuelo, esa lectura es anterior a
  // la orden: la siguiente debe ser pronto, no al intervalo normal.
  let soonMs: number | null = null;

  const isFresh = () => last !== null && Date.now() - lastReadAt < playingMs;

  function changed(prev: MediaSnapshot | null, next: MediaSnapshot): boolean {
    if (!prev) return true;
    const { progressMs: _p, measuredAt: _m, ...a } = prev;
    const { progressMs: _p2, measuredAt: _m2, ...b } = next;
    if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    if (!next.isPlaying) return next.progressMs !== prev.progressMs;
    // Sonando, el avance natural no es un cambio; un salto (seek) sí.
    const elapsed =
      new Date(next.measuredAt).getTime() - new Date(prev.measuredAt).getTime();
    return (
      Math.abs(next.progressMs - (prev.progressMs + elapsed)) >
      SEEK_TOLERANCE_MS
    );
  }

  function schedule(delayMs: number): void {
    if (stopped || timer || !deps.hasClients()) return;
    timer = setTimeout(() => {
      timer = null;
      void read();
    }, delayMs);
    timer.unref();
  }

  function read(): Promise<MediaSnapshot> {
    // Guarda de solapamiento, como en poller.ts: una lectura lenta no apila
    // peticiones contra una API cuyos límites no se publican.
    if (inFlight) return inFlight;
    const run = deps
      .read(new Date())
      .then((reading) => {
        const prev = last;
        last = reading.snapshot;
        lastReadAt = Date.now();
        if (changed(prev, reading.snapshot)) deps.onChange(reading.snapshot);
        const wanted = soonMs;
        soonMs = null;
        schedule(
          reading.retryAfterMs !== undefined
            ? Math.max(idleMs, reading.retryAfterMs)
            : wanted !== null
              ? wanted
              : reading.snapshot.isPlaying
                ? playingMs
                : idleMs,
        );
        return reading.snapshot;
      })
      .catch((err) => {
        // `read` degrada solo; esto es la red de seguridad para que un
        // fallo inesperado no pare el ciclo.
        console.error("Fallo leyendo Spotify:", (err as Error).message);
        schedule(idleMs);
        return last as MediaSnapshot;
      })
      .finally(() => {
        inFlight = null;
      });
    inFlight = run;
    return run;
  }

  return {
    wake() {
      if (stopped || timer || inFlight || !deps.hasClients()) return;
      if (isFresh()) schedule(playingMs);
      else void read();
    },
    pollNow() {
      if (stopped || !deps.hasClients()) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      void read();
    },
    pollSoon(delayMs = 500) {
      if (stopped || !deps.hasClients()) return;
      if (inFlight) {
        soonMs = delayMs;
        return;
      }
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      schedule(delayMs);
    },
    snapshot() {
      if (last && isFresh()) return Promise.resolve(last);
      return read();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
