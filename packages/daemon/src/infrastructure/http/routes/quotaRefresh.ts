import type { RouteHandler } from "../server.ts";

/**
 * POST /api/quota/refresh — botón de recarga manual del panel de cuota.
 * `pollNow()` respeta el mismo guard de solapamiento que el intervalo de
 * 180s (poller.ts): dispara la muestra y responde, sin esperarla — el
 * dato fresco llega por el evento SSE `quota` que el poller ya
 * broadcastea al terminar, igual que cualquier otro tick.
 */
export function createQuotaRefreshRoute(pollNow: () => void): RouteHandler {
  return async ({ res }) => {
    pollNow();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");
  };
}
