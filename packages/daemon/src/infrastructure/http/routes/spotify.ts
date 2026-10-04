import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type DaemonMessage,
  formatMessage,
  type MessageLanguage,
  msg,
} from "@amnis/shared";
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
  /** Borra el token (conserva el Client ID) y avisa al poller de media. */
  logout: () => void;
  /** Idioma de la página de vuelta del login; sin él, el del navegador. */
  language?: (req: IncomingMessage) => MessageLanguage;
  now?: () => number;
}

/**
 * La pestaña de vuelta la abre el navegador: su `Accept-Language` es lo más
 * fiable. Sin preferencia (`*` o sin cabecera), el idioma por defecto, español.
 */
export function acceptLanguage(req: IncomingMessage): MessageLanguage {
  const first =
    req.headers["accept-language"]?.split(",")[0]?.trim().toLowerCase() ?? "";
  return first === "" || first === "*" || first.startsWith("es") ? "es" : "en";
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
 * `POST /api/spotify/login`, `GET /api/spotify/callback` y
 * `POST /api/spotify/logout`. El verifier PKCE
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
          error: msg("spotify.missingClientId"),
          remedy: msg("spotify.clientIdRemedy"),
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

    "POST /api/spotify/logout": ({ res }) => {
      deps.logout();
      sendJson(res, 200, {});
    },

    "GET /api/spotify/callback": async ({ req, res, url }) => {
      const language = (deps.language ?? acceptLanguage)(req);
      const page = (status: number, message: DaemonMessage) =>
        sendPage(res, status, formatMessage(language, message));
      purgeExpired();
      const state = url.searchParams.get("state") ?? "";
      // Un solo uso: se consume antes de cualquier otra comprobación.
      const entry = pending.get(state);
      pending.delete(state);

      if (!entry) {
        page(400, msg("spotify.page.expired"));
        return;
      }
      if (url.searchParams.get("error")) {
        page(400, msg("spotify.page.cancelled"));
        return;
      }
      const code = url.searchParams.get("code");
      const clientId = deps.readClientId();
      if (!code || !clientId) {
        page(400, msg("spotify.page.incomplete"));
        return;
      }

      const outcome = await deps.exchangeCode({
        clientId,
        code,
        verifier: entry.verifier,
        redirectUri: deps.redirectUri,
      });
      if (!outcome.ok) {
        page(502, outcome.message);
        return;
      }
      deps.saveToken({
        accessToken: outcome.accessToken,
        refreshToken: outcome.refreshToken,
        expiresAt: outcome.expiresAt,
        scope: outcome.scope,
      });
      page(200, msg("spotify.page.connected"));
    },
  };
}
