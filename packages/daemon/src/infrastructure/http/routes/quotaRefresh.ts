import type { QuotaSnapshot } from "@amnis/shared";
import type { RouteHandler } from "../server.ts";

export const RATE_LIMITED_MESSAGE =
  "Anthropic está limitando las consultas, prueba en unos minutos.";

/**
 * POST /api/quota/refresh — botón de recarga manual del panel de cuota.
 * Es la excepción a propósito a «solo el poller sondea» (#116): una petición
 * explícita del usuario. `pollNow()` espera a la muestra (o se une a la que ya
 * va en vuelo, sin apilar otra contra el endpoint) para poder decir cómo
 * acabó: con 429 responde el error y el botón lo enseña, y los datos que la
 * vista ya tenía se quedan (sampleQuota.ts los conserva).
 */
export function createQuotaRefreshRoute(
  pollNow: () => Promise<QuotaSnapshot>,
): RouteHandler {
  return async ({ res }) => {
    let status = 200;
    let body: Record<string, string> = {};
    try {
      const snapshot = await pollNow();
      if (snapshot.rateLimitedAt !== null) {
        status = 429;
        body = { error: RATE_LIMITED_MESSAGE };
      }
    } catch (err) {
      status = 500;
      body = { error: (err as Error).message };
    }
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
}
