import type { ClaudeSkillStatus } from "@amnis/shared";
import type { RouteHandler } from "../server.ts";

/**
 * GET /api/skill — si la skill `amnis-skin` está en Claude Code y al día.
 * POST /api/skill/install — el botón del dashboard (#160): la copia o la actualiza.
 */
export function createSkillRoutes(deps: {
  status: () => ClaudeSkillStatus;
  install: () => void;
}): Record<string, RouteHandler> {
  const reply = (res: Parameters<RouteHandler>[0]["res"]) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(deps.status()));
  };
  return {
    "GET /api/skill": ({ res }) => reply(res),
    "POST /api/skill/install": ({ res }) => {
      deps.install();
      reply(res);
    },
  };
}
