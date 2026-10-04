import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer as createNodeServer } from "node:http";
import { type DaemonMessage, msg } from "@amnis/shared";
import { type AllowedOrigins, allowedOrigins, PORT } from "../../config.ts";

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
  /** Origen del dev server de Vite, admitido solo en `pnpm dev` (#88). */
  devOrigin?: string;
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

/**
 * Protección de origen (#88). Loopback impide que entre otra máquina, no que
 * entre otra *web*: cualquier página abierta en el navegador puede mandar un
 * POST a 127.0.0.1, y con DNS rebinding hasta leer la respuesta. Devuelve el
 * motivo del rechazo, o `null` si la petición pasa.
 * - `Host` tiene que ser el del daemon, también en las lecturas (#135): corta
 *   el DNS rebinding, donde el navegador manda el dominio del atacante y la
 *   política de mismo origen le deja leer `/api/sessions` o `/api/usage`.
 * - `Origin`, si viene, tiene que ser el del daemon, solo en escrituras. Sin él
 *   (curl del hook, CLI) se acepta: un navegador siempre lo manda en un POST
 *   cross-origin. En un GET cross-origin el navegador no deja leer la
 *   respuesta sin cabeceras CORS, que el daemon no manda.
 */
export function checkOrigin(
  req: IncomingMessage,
  allowed: AllowedOrigins,
): DaemonMessage | null {
  const host = req.headers.host;
  if (host === undefined || !allowed.hosts.has(host)) {
    return msg("http.hostNotAllowed", { host: host ?? "—" });
  }
  if (req.method === "GET" || req.method === "HEAD") return null;
  const origin = req.headers.origin;
  if (origin !== undefined && !allowed.origins.has(origin)) {
    return msg("http.originNotAllowed", { origin });
  }
  return null;
}

function dispatch(handler: RouteHandler, ctx: RouteContext): void {
  // El executor de `new Promise` corre síncronamente y convierte un
  // `throw` en rechazo: con `Promise.resolve(handler(ctx))` el throw
  // síncrono se evaluaba antes de existir la promesa y escapaba del
  // catch (#48). Así síncrono y asíncrono acaban en el mismo sitio.
  new Promise<void>((resolve) => resolve(handler(ctx))).catch((err) => {
    // Un handler que revienta no puede tumbar el daemon entero: una
    // promesa rechazada sin catch es fatal en Node 24. /api/events ya
    // ha escrito cabeceras SSE antes de fallar, así que un writeHead
    // aquí volvería a lanzar — solo se intenta si aún no se ha
    // respondido nada.
    console.error("Error en handler:", err);
    if (!ctx.res.headersSent) {
      sendJson(ctx.res, 500, { error: msg("http.internal") });
    } else {
      ctx.res.end();
    }
  });
}

export function createHttpServer(deps: HttpServerDeps): AmnisHttpServer {
  const openResponses = new Set<ServerResponse>();
  // Se fija en listen(): con el puerto 0 de los tests solo se sabe entonces.
  let allowed = allowedOrigins(PORT, deps.devOrigin);

  const server: Server = createNodeServer((req, res) => {
    openResponses.add(res);
    res.on("close", () => openResponses.delete(res));

    const method = req.method ?? "GET";
    // Antes de buscar ruta: a un origen ajeno no se le dice qué rutas existen.
    const reason = checkOrigin(req, allowed);
    if (reason !== null) {
      sendJson(res, 403, { error: reason });
      return;
    }
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
      sendJson(res, 405, { error: msg("http.methodNotAllowed") });
    } else {
      sendJson(res, 404, { error: msg("http.notFound") });
    }
  });

  return {
    listen(port = PORT) {
      return new Promise((resolve) => {
        server.listen(port, "127.0.0.1", () => {
          const address = server.address();
          const actual =
            typeof address === "object" && address ? address.port : port;
          allowed = allowedOrigins(actual, deps.devOrigin);
          resolve(actual);
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
