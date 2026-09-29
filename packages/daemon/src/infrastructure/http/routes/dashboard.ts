import { readFileSync } from "node:fs";
import { RESOURCES } from "../../../config.ts";
import type { RouteHandler } from "../server.ts";

/**
 * GET / — la rebanada vertical fea (#29): sin build, sin React. Lee el
 * fichero en cada petición, no lo cachea: editarlo y refrescar el
 * navegador basta, sin reiniciar el daemon.
 */
export function createDashboardRoute(): RouteHandler {
  return ({ res }) => {
    const html = readFileSync(RESOURCES.dashboardHtml, "utf8");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  };
}
