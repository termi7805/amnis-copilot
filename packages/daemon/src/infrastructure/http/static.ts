import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import type { RouteHandler } from "./server.ts";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function contentTypeFor(path: string): string {
  return MIME_TYPES[extname(path)] ?? "application/octet-stream";
}

function sendFile(
  res: Parameters<RouteHandler>[0]["res"],
  status: number,
  path: string,
): void {
  res.writeHead(status, { "Content-Type": contentTypeFor(path) });
  res.end(readFileSync(path));
}

function sendText(
  res: Parameters<RouteHandler>[0]["res"],
  status: number,
  text: string,
): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

/**
 * Sirve `apps/web/dist` con fallback a `index.html` para las rutas de
 * la SPA (#38) — cero dependencias, `node:fs` y `node:path` a pelo, sin
 * `serve-static`.
 */
export function createStaticRoute(rootDir: string): RouteHandler {
  const root = resolve(rootDir);
  const indexHtml = join(root, "index.html");

  return ({ res, url }) => {
    if (!existsSync(root)) {
      sendText(
        res,
        503,
        "Falta apps/web/dist. Ejecuta `pnpm build` desde la raíz del repo.",
      );
      return;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      sendText(res, 404, "No encontrado.");
      return;
    }

    // El resuelto tiene que caer dentro de `root`: new URL() normaliza
    // los ".." literales pero no decodifica "%2e%2e", así que la
    // comprobación va sobre la ruta ya resuelta, no sobre el texto.
    const target = resolve(join(root, decoded));
    const inside = target === root || target.startsWith(root + sep);
    if (!inside) {
      sendText(res, 404, "No encontrado.");
      return;
    }

    if (existsSync(target) && statSync(target).isFile()) {
      sendFile(res, 200, target);
      return;
    }

    // Sin extensión: ruta de la SPA (/pet, /loquesea) → index.html. Con
    // extensión: un asset que falta es un 404 de verdad, no HTML
    // disfrazado de .js.
    if (extname(decoded) === "") {
      sendFile(res, 200, indexHtml);
      return;
    }

    sendText(res, 404, "No encontrado.");
  };
}
