import type { IncomingMessage } from "node:http";
import {
  type RecordHookDeps,
  recordHook,
} from "../../../application/recordHook.ts";
import type { RouteHandler } from "../server.ts";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * POST /api/hook/claude — responde 200 antes de procesar.
 *
 * El hook (packages/daemon/hooks/amnis-hook.sh) está en la ruta crítica del
 * agente: el tiempo hasta el 200 es tiempo del agente. Un payload
 * malformado se registra y se descarta, nunca un 500 — el script del hook
 * ignora la respuesta, pero el servidor no puede caerse por un evento raro.
 */
export function createHookRoute(deps: RecordHookDeps): RouteHandler {
  return async ({ req, res }) => {
    const bodyText = await readBody(req);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");

    setImmediate(() => {
      let raw: unknown;
      try {
        raw = JSON.parse(bodyText);
      } catch {
        return;
      }
      recordHook(deps, raw);
    });
  };
}
