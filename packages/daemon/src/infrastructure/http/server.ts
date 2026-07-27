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

export function createHttpServer(deps: HttpServerDeps): AmnisHttpServer {
  const openResponses = new Set<ServerResponse>();

  const server: Server = createNodeServer((req, res) => {
    openResponses.add(res);
    res.on("close", () => openResponses.delete(res));

    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const handler = deps.routes[`${method} ${url.pathname}`];

    if (handler) {
      void handler({ req, res, url });
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
