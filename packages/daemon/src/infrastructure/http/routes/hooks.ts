import type { RepairHooksResponse } from "@amnis/shared";
import type { RouteHandler } from "../server.ts";

/**
 * POST /api/hooks/install — el botón "Reparar hooks" (#90). Mismo merge no
 * destructivo que `amnis install-hooks`: la lógica vive en
 * `application/installHooks.ts` y las dos puertas llaman a lo mismo.
 */
export function createHooksRoutes(
  repair: () => RepairHooksResponse,
): Record<string, RouteHandler> {
  return {
    "POST /api/hooks/install": ({ res }) => {
      const body = repair();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    },
  };
}
