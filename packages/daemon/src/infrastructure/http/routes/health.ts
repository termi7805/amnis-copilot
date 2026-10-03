import type { HealthResponse } from "@amnis/shared";
import { type DiagnoseFacts, diagnose } from "../../../application/diagnose.ts";
import type { RouteHandler } from "../server.ts";

export interface HealthRouteDeps {
  facts(): Promise<DiagnoseFacts>;
  daemon(): HealthResponse["daemon"];
}

/**
 * GET /api/health — lo mismo que `amnis doctor`, con los mismos mensajes y
 * remedios (#89). Responde 200 aunque haya ✗: un chequeo fallido es el dato,
 * no un error de la petición.
 */
export function createHealthRoute(deps: HealthRouteDeps): RouteHandler {
  return async ({ res }) => {
    const body: HealthResponse = {
      checks: diagnose(await deps.facts(), new Date()),
      daemon: deps.daemon(),
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
}
