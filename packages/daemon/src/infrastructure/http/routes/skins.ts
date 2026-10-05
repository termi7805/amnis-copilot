import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { msg } from "@amnis/shared";
import { listSkins } from "../../../application/skins.ts";
import {
  isSkinId,
  resolveInside,
  skinFolder,
  skinIds,
} from "../../skinFiles.ts";
import type { RouteHandler } from "../server.ts";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

const PREFIX = "/api/skins/";

function notFound(res: Parameters<RouteHandler>[0]["res"]): void {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: msg("http.notFound") }));
}

/**
 * `GET /api/skins` lista las skins de `root` leyendo el disco en cada petición;
 * `GET /api/skins/<id>/<ruta>` sirve una imagen de una skin.
 *
 * ⚠️ La ruta viene de la URL: `new URL` solo normaliza los `..` literales, no
 * `%2e%2e`, así que se decodifica aquí y `resolveInside` decide, con los
 * enlaces simbólicos ya resueltos. Un SVG abierto como documento correría
 * scripts con el origen del daemon: la CSP con `sandbox` lo impide.
 */
export function createSkinsRoutes(root: string): Record<string, RouteHandler> {
  return {
    "GET /api/skins": ({ res }) => {
      const body = listSkins({
        skinIds: () => skinIds(root),
        folder: (id) => skinFolder(join(root, id)),
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    },

    "GET /api/skins/*": ({ res, url }) => {
      let rest: string;
      try {
        rest = decodeURIComponent(url.pathname.slice(PREFIX.length));
      } catch {
        notFound(res);
        return;
      }
      const slash = rest.indexOf("/");
      const id = slash === -1 ? rest : rest.slice(0, slash);
      const file =
        isSkinId(id) && slash !== -1
          ? resolveInside(join(root, id), rest.slice(slash + 1))
          : null;
      const mime =
        file === null ? undefined : MIME_TYPES[extname(file).toLowerCase()];
      if (file === null || mime === undefined) {
        notFound(res);
        return;
      }
      res.writeHead(200, {
        "Content-Type": mime,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      });
      res.end(readFileSync(file));
    },
  };
}
