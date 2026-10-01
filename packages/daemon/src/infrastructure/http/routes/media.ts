import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  ControlErrorKind,
  ControlFailure,
  ControlResult,
  MediaControl,
  RepeatMode,
} from "../../providers/spotify/control.ts";
import type { RouteHandler } from "../server.ts";

/**
 * ⚠️ Rutas de **escritura**: mueven la música del usuario. Si algún día hay
 * túnel remoto, deben quedar fuera del listener de solo lectura.
 */

export interface MediaRoutesDeps {
  control: MediaControl;
  /** Tras una orden con éxito: forzar una lectura del poller (Spotify tarda
   * unos cientos de ms en reflejarla en `/me/player`). */
  afterAction: () => void;
}

/** El mapeo vive aquí y no en el provider: es contrato HTTP, no de Spotify. */
const STATUS: Record<ControlErrorKind, number> = {
  "no-device": 409,
  forbidden: 403,
  "rate-limited": 429,
  "not-logged-in": 401,
  unavailable: 502,
};

const REPEAT_MODES: readonly RepeatMode[] = ["off", "context", "track"];

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function sendFailure(res: ServerResponse, failure: ControlFailure): void {
  sendJson(
    res,
    STATUS[failure.kind],
    {
      error: failure.message,
      kind: failure.kind,
      ...(failure.kind === "not-logged-in" && {
        remedy: "Conecta Spotify con `amnis spotify login`.",
      }),
    },
    failure.kind === "rate-limited" && failure.retryAfterMs !== undefined
      ? { "Retry-After": String(Math.ceil(failure.retryAfterMs / 1000)) }
      : {},
  );
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Un `throw` inesperado del provider no puede acabar en el 500 genérico. */
async function safely<T extends { ok: boolean }>(
  run: () => Promise<T>,
): Promise<T | ControlFailure> {
  try {
    return await run();
  } catch (err) {
    console.error("Fallo en el control de Spotify:", (err as Error).message);
    return {
      ok: false,
      kind: "unavailable",
      message: "Error inesperado hablando con Spotify.",
    };
  }
}

export function createMediaRoutes(
  deps: MediaRoutesDeps,
): Record<string, RouteHandler> {
  const { control } = deps;

  async function act(
    res: ServerResponse,
    run: () => Promise<ControlResult>,
  ): Promise<void> {
    const result = await safely(run);
    if (!result.ok) {
      sendFailure(res, result);
      return;
    }
    deps.afterAction();
    sendJson(res, 200, {});
  }

  /** Orden con un campo en el body: valida antes de tocar Spotify. */
  function withBody<T>(
    parse: (body: Record<string, unknown>) => T | null,
    expected: string,
    run: (value: T) => Promise<ControlResult>,
  ): RouteHandler {
    return async ({ req, res }) => {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: "El body no es JSON válido." });
        return;
      }
      const value =
        typeof body === "object" && body !== null
          ? parse(body as Record<string, unknown>)
          : null;
      if (value === null) {
        sendJson(res, 400, { error: `Body inválido: ${expected}.` });
        return;
      }
      await act(res, () => run(value));
    };
  }

  const simple =
    (run: () => Promise<ControlResult>): RouteHandler =>
    ({ res }) =>
      act(res, run);

  return {
    "POST /api/media/play": simple(() => control.play()),
    "POST /api/media/pause": simple(() => control.pause()),
    "POST /api/media/next": simple(() => control.next()),
    "POST /api/media/previous": simple(() => control.previous()),
    "POST /api/media/seek": withBody(
      (b) =>
        typeof b.positionMs === "number" &&
        Number.isInteger(b.positionMs) &&
        b.positionMs >= 0
          ? b.positionMs
          : null,
      "{ positionMs: entero >= 0 }",
      (positionMs) => control.seek(positionMs),
    ),
    "POST /api/media/shuffle": withBody(
      (b) => (typeof b.state === "boolean" ? b.state : null),
      "{ state: boolean }",
      (state) => control.setShuffle(state),
    ),
    "POST /api/media/repeat": withBody(
      (b) =>
        REPEAT_MODES.includes(b.mode as RepeatMode)
          ? (b.mode as RepeatMode)
          : null,
      '{ mode: "off" | "context" | "track" }',
      (mode) => control.setRepeat(mode),
    ),
    "POST /api/media/transfer": withBody(
      (b) =>
        typeof b.deviceId === "string" && b.deviceId.length > 0
          ? b.deviceId
          : null,
      "{ deviceId: string no vacío }",
      (deviceId) => control.transfer(deviceId),
    ),
    "GET /api/media/devices": async ({ res }) => {
      const result = await safely(() => control.devices());
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      sendJson(res, 200, { devices: result.devices });
    },
  };
}
