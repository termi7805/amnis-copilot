import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer as createNodeServer } from "node:http";
import { PORT } from "../../config.ts";

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
}

export type RouteHandler = (ctx: RouteContext) => void | Promise<void>;

/**
 * Clave "MÉTODO /api/ruta". Los handlers reales cuelgan de
 * `http/routes/*.ts` y se registran aquí — este fichero no se reedita
 * cada vez que aparece una ruta nueva.
 */
export interface HttpServerDeps {
  routes: Record<string, RouteHandler>;
  /**
   * Se dispara cuando ninguna ruta exacta encaja y el path no empieza
   * por `/api/` — esa guarda vive aquí porque STACK.md §4 ya declara
   * "la API bajo /api" como la regla que separa las dos cosas que el
   * daemon sirve por el mismo puerto (routes/static.ts, #38).
   */
  fallback?: RouteHandler;
}

export interface AmnisHttpServer {
  /** Resuelve con el puerto real: los tests piden 0 para no competir por PORT. */
  listen(port?: number): Promise<number>;
  /** Cierra los streams abiertos (SSE) antes de cerrar el servidor. */
  close(): Promise<void>;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function dispatch(handler: RouteHandler, ctx: RouteContext): void {
  Promise.resolve(handler(ctx)).catch((err) => {
    // Un handler que revienta no puede tumbar el daemon entero: una
    // promesa rechazada sin catch es fatal en Node 24. /api/events ya
    // ha escrito cabeceras SSE antes de fallar, así que un writeHead
    // aquí volvería a lanzar — solo se intenta si aún no se ha
    // respondido nada.
    console.error("Error en handler:", err);
    if (!ctx.res.headersSent) {
      sendJson(ctx.res, 500, { error: "Error interno." });
    } else {
      ctx.res.end();
    }
  });
}

export function createHttpServer(deps: HttpServerDeps): AmnisHttpServer {
  const openResponses = new Set<ServerResponse>();

  const server: Server = createNodeServer((req, res) => {
    openResponses.add(res);
    res.on("close", () => openResponses.delete(res));

    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const ctx: RouteContext = { req, res, url };
    const handler = deps.routes[`${method} ${url.pathname}`];

    if (handler) {
      dispatch(handler, ctx);
      return;
    }

    if (deps.fallback && !url.pathname.startsWith("/api/")) {
      dispatch(deps.fallback, ctx);
      return;
    }

    const knownPath = Object.keys(deps.routes).some(
      (key) => key.slice(key.indexOf(" ") + 1) === url.pathname,
    );
    if (knownPath) {
      sendJson(res, 405, { error: "Método no permitido." });
    } else {
      sendJson(res, 404, { error: "No encontrado." });
    }
  });

  return {
    listen(port = PORT) {
      return new Promise((resolve) => {
        server.listen(port, "127.0.0.1", () => {
          const address = server.address();
          resolve(typeof address === "object" && address ? address.port : port);
        });
      });
    },
    close() {
      for (const res of openResponses) res.end();
      openResponses.clear();
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
