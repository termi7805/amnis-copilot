import { type GetStateDeps, getState } from "../../../application/getState.ts";
import type { RouteHandler } from "../server.ts";

function sendJson(
  res: Parameters<RouteHandler>[0]["res"],
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/** GET /api/state — rebanada vertical: hook → daemon → SQLite → aquí. */
export function createStateRoute(deps: GetStateDeps): RouteHandler {
  return async ({ res }) => {
    const state = await getState(deps, new Date());
    sendJson(res, 200, state);
  };
}
