import { msg, type RebuildEvent } from "@amnis/shared";
import type { RouteHandler } from "../server.ts";

export interface IngestRoutesDeps {
  /** Reconstruye la caché sin bloquear el daemon; rechaza con el motivo. */
  rebuild(): Promise<void>;
  broadcast(event: RebuildEvent): void;
}

function sendJson(
  res: Parameters<RouteHandler>[0]["res"],
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * POST /api/ingest/rebuild — responde `202` y avisa por SSE (`rebuild`) al
 * terminar (#90). Reconstruir tarda segundos: en línea congelaría el bucle de
 * eventos, y con él el panel de la mascota. Solo una a la vez.
 */
export function createIngestRoutes(
  deps: IngestRoutesDeps,
): Record<string, RouteHandler> {
  let running = false;

  return {
    "POST /api/ingest/rebuild": ({ res }) => {
      if (running) {
        sendJson(res, 409, { error: msg("ingest.rebuildRunning") });
        return;
      }
      running = true;
      deps
        .rebuild()
        .then(
          () => deps.broadcast({ status: "done" }),
          (err: unknown) =>
            deps.broadcast({
              status: "error",
              error: msg("ingest.rebuildFailed", {
                detail: err instanceof Error ? err.message : String(err),
              }),
            }),
        )
        .finally(() => {
          running = false;
        });
      sendJson(res, 202, {});
    },
  };
}
