import type { RouteHandler } from "../server.ts";

/**
 * POST /api/shutdown — «Cerrar Amnis» del dashboard. El navegador no puede
 * cerrar la app de escritorio: el `quit` llega a la ventana de la mascota
 * por SSE y ella cierra Tauri. Después se para el daemon, por si no lo
 * lanzó la app (`amnis serve`). El `quit` se escribe antes de cerrar el
 * servidor, y cerrar termina las SSE abiertas sin perderlo.
 */
export function createShutdownRoute(deps: {
  broadcastQuit: () => void;
  shutdown: () => void;
}): RouteHandler {
  return ({ res }) => {
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end("{}");
    deps.broadcastQuit();
    deps.shutdown();
  };
}
