import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { SpotifyToken } from "../../persistence/spotifyToken.ts";
import {
  buildAuthorizeUrl,
  createPkcePair,
  type SpotifyTokenOutcome,
} from "../../providers/spotify/oauth.ts";
import type { RouteHandler } from "../server.ts";

/** Lo que tarda el usuario en autorizar antes de que el `state` caduque. */
export const PENDING_TTL_MS = 5 * 60_000;

export interface SpotifyRoutesDeps {
  readClientId: () => string | null;
  redirectUri: string;
  openBrowser: (url: string) => void;
  exchangeCode: (opts: {
    clientId: string;
    code: string;
    verifier: string;
    redirectUri: string;
  }) => Promise<SpotifyTokenOutcome>;
  saveToken: (token: SpotifyToken) => void;
  now?: () => number;
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );
}

function sendPage(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><meta charset="utf-8"><title>Amnis</title>` +
      `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto">` +
      `<p>${escapeHtml(message)}</p></body>`,
  );
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * `POST /api/spotify/login` y `GET /api/spotify/callback`. El verifier PKCE
 * vive solo en memoria entre las dos: si el daemon se reinicia a mitad, el
 * callback cae en "state desconocido" y da un error legible, no un 500.
 */
export function createSpotifyRoutes(
  deps: SpotifyRoutesDeps,
): Record<string, RouteHandler> {
  const now = deps.now ?? Date.now;
  const pending = new Map<string, { verifier: string; createdAt: number }>();

  function purgeExpired(): void {
    for (const [state, entry] of pending) {
      if (now() - entry.createdAt > PENDING_TTL_MS) pending.delete(state);
    }
  }

  return {
    "POST /api/spotify/login": ({ res }) => {
      const clientId = deps.readClientId();
      if (!clientId) {
        sendJson(res, 409, {
          error: "Falta el Client ID de Spotify.",
          remedy: "amnis spotify login --client-id <tu id>",
        });
        return;
      }
      purgeExpired();
      const state = randomBytes(16).toString("base64url");
      const { verifier, challenge } = createPkcePair();
      pending.set(state, { verifier, createdAt: now() });
      const url = buildAuthorizeUrl({
        clientId,
        redirectUri: deps.redirectUri,
        state,
        challenge,
      });
      deps.openBrowser(url);
      sendJson(res, 200, { url });
    },

    "GET /api/spotify/callback": async ({ res, url }) => {
      purgeExpired();
      const state = url.searchParams.get("state") ?? "";
      // Un solo uso: se consume antes de cualquier otra comprobación.
      const entry = pending.get(state);
      pending.delete(state);

      if (!entry) {
        sendPage(
          res,
          400,
          "El login caducó o el daemon se reinició. Vuelve a pulsar Conectar.",
        );
        return;
      }
      if (url.searchParams.get("error")) {
        sendPage(res, 400, "Cancelaste el login de Spotify.");
        return;
      }
      const code = url.searchParams.get("code");
      const clientId = deps.readClientId();
      if (!code || !clientId) {
        sendPage(
          res,
          400,
          "Respuesta de Spotify incompleta. Vuelve a pulsar Conectar.",
        );
        return;
      }

      const outcome = await deps.exchangeCode({
        clientId,
        code,
        verifier: entry.verifier,
        redirectUri: deps.redirectUri,
      });
      if (!outcome.ok) {
        sendPage(res, 502, outcome.message);
        return;
      }
      deps.saveToken({
        accessToken: outcome.accessToken,
        refreshToken: outcome.refreshToken,
        expiresAt: outcome.expiresAt,
        scope: outcome.scope,
      });
      sendPage(res, 200, "Spotify conectado. Ya puedes cerrar esta pestaña.");
    },
  };
}
