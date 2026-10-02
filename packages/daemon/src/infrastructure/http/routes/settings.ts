import type { IncomingMessage, ServerResponse } from "node:http";
import type { MusicPrefs } from "@amnis/shared";
import { validateMusicPrefs } from "../../../domain/musicPrefs.ts";
import type { RouteHandler } from "../server.ts";

/**
 * ⚠️ `PUT /api/settings` es una ruta de **escritura**: si algún día hay túnel
 * remoto, debe quedar fuera del listener de solo lectura.
 */

export interface SettingsRoutesDeps {
  /** Las preferencias actuales (en memoria). */
  get(): MusicPrefs;
  /** Guarda en disco, actualiza la copia en memoria y avisa por SSE. */
  save(prefs: MusicPrefs): void;
}

/** Un body de preferencias son unas decenas de bytes; esto es solo un tope. */
const MAX_BODY_BYTES = 16 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on("end", () =>
      resolve(
        size > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString("utf8"),
      ),
    );
    req.on("error", reject);
  });
}

export function createSettingsRoutes(
  deps: SettingsRoutesDeps,
): Record<string, RouteHandler> {
  return {
    "GET /api/settings": ({ res }) => sendJson(res, 200, deps.get()),

    "PUT /api/settings": async ({ req, res }) => {
      const raw = await readBody(req);
      if (raw === null) {
        sendJson(res, 413, {
          error: "El body es demasiado grande.",
          field: "body",
        });
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, {
          error: "El body no es JSON válido.",
          field: "body",
        });
        return;
      }
      const result = validateMusicPrefs(body, deps.get());
      if (!result.ok) {
        sendJson(res, 400, { error: result.message, field: result.field });
        return;
      }
      deps.save(result.prefs);
      sendJson(res, 200, result.prefs);
    },
  };
}
