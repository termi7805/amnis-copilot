import { useEffect } from "react";
import { daemonUrl } from "./config.ts";

/** Dos focos seguidos (foco de ventana + visibilidad suelen llegar juntos)
 * son un solo "alguien mira". */
const REFRESH_THROTTLE_MS = 2_000;

/**
 * Avisa al daemon de que alguien mira, al recuperar el foco la ventana o al
 * volverse visible la pestaña: el daemon sondea Spotify rápido unos minutos
 * y lo que se ve, incluidos cambios hechos desde el móvil, está al día. En
 * pausa y sin nadie mirando, sondea despacio.
 */
export function useRefreshMediaOnFocus(): void {
  useEffect(() => {
    let lastAt = 0;
    const refresh = () => {
      const now = Date.now();
      if (now - lastAt < REFRESH_THROTTLE_MS) return;
      lastAt = now;
      fetch(`${daemonUrl()}/api/media/refresh`, { method: "POST" }).catch(
        () => {},
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}

/**
 * `connect` no es una orden de reproducción sino la de abrir el login de
 * Spotify, pero comparte camino y errores con el resto: así `<MediaPlayer>`
 * tiene una sola vía por la que le llega "algo salió mal" (#53).
 */
export type MediaCommand = "play" | "pause" | "next" | "previous" | "connect";

export type MediaCommandResult =
  | { ok: true }
  | { ok: false; message: string; remedy?: string };

const ROUTE: Record<MediaCommand, string> = {
  play: "/api/media/play",
  pause: "/api/media/pause",
  next: "/api/media/next",
  previous: "/api/media/previous",
  connect: "/api/spotify/login",
};

/**
 * `POST` de una orden al daemon. El daemon ya traduce los errores de Spotify
 * a texto en español (409 sin dispositivo, 403 sin Premium…): aquí solo se
 * recoge ese texto, no se reinterpreta.
 */
export async function sendMediaCommand(
  command: MediaCommand,
): Promise<MediaCommandResult> {
  let response: Response;
  try {
    response = await fetch(`${daemonUrl()}${ROUTE[command]}`, {
      method: "POST",
    });
  } catch {
    return { ok: false, message: "No se pudo contactar con Amnis." };
  }
  if (response.ok) return { ok: true };

  try {
    const body = (await response.json()) as {
      error?: unknown;
      remedy?: unknown;
    };
    if (typeof body.error === "string") {
      return {
        ok: false,
        message: body.error,
        ...(typeof body.remedy === "string" && { remedy: body.remedy }),
      };
    }
  } catch {
    // Cuerpo que no es JSON: el status basta.
  }
  return { ok: false, message: `Spotify respondió ${response.status}.` };
}
