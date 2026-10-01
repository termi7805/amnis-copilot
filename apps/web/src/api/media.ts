import type { MediaDeviceOption } from "@amnis/shared";
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
export type SimpleMediaCommand =
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "connect";

/** Órdenes con body: cada una añade su variante a esta unión. */
export type MediaCommand =
  | SimpleMediaCommand
  | { kind: "seek"; positionMs: number }
  | { kind: "transfer"; deviceId: string };

export type MediaCommandResult =
  | { ok: true }
  | { ok: false; message: string; remedy?: string };

type MediaFailure = Extract<MediaCommandResult, { ok: false }>;

const ROUTE: Record<SimpleMediaCommand, string> = {
  play: "/api/media/play",
  pause: "/api/media/pause",
  next: "/api/media/next",
  previous: "/api/media/previous",
  connect: "/api/spotify/login",
};

function bodyRequest(command: Exclude<MediaCommand, string>): {
  path: string;
  body: unknown;
} {
  switch (command.kind) {
    case "seek":
      return {
        path: "/api/media/seek",
        body: { positionMs: Math.max(0, Math.round(command.positionMs)) },
      };
    case "transfer":
      return {
        path: "/api/media/transfer",
        body: { deviceId: command.deviceId },
      };
  }
}

/**
 * El daemon ya traduce los errores de Spotify a texto en español (409 sin
 * dispositivo, 403 sin Premium…): aquí solo se recoge ese texto, no se
 * reinterpreta.
 */
async function failureOf(response: Response): Promise<MediaFailure> {
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

const UNREACHABLE: MediaFailure = {
  ok: false,
  message: "No se pudo contactar con Amnis.",
};

/** `POST` de una orden al daemon. */
export async function sendMediaCommand(
  command: MediaCommand,
): Promise<MediaCommandResult> {
  let response: Response;
  try {
    if (typeof command === "string") {
      response = await fetch(`${daemonUrl()}${ROUTE[command]}`, {
        method: "POST",
      });
    } else {
      const { path, body } = bodyRequest(command);
      response = await fetch(`${daemonUrl()}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
  } catch {
    return UNREACHABLE;
  }
  return response.ok ? { ok: true } : failureOf(response);
}

export type MediaDevicesResult =
  | { ok: true; devices: MediaDeviceOption[] }
  | MediaFailure;

/**
 * Lista de dispositivos Spotify Connect. Se pide al abrir el selector, no en
 * el sondeo: cambia poco y gastaría cuota de rate limit para nada.
 */
export async function fetchMediaDevices(): Promise<MediaDevicesResult> {
  let response: Response;
  try {
    response = await fetch(`${daemonUrl()}/api/media/devices`);
  } catch {
    return UNREACHABLE;
  }
  if (!response.ok) return failureOf(response);
  try {
    const body = (await response.json()) as { devices?: MediaDeviceOption[] };
    return { ok: true, devices: body.devices ?? [] };
  } catch {
    return { ok: false, message: "Respuesta de Amnis no válida." };
  }
}
