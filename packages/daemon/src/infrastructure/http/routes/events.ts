import type { StateResponse } from "@amnis/shared";
import type { EventBroadcaster } from "../events.ts";
import type { RouteHandler } from "../server.ts";

export interface EventsRouteDeps {
  broadcaster: EventBroadcaster;
  hello(): Promise<StateResponse>;
}

/**
 * GET /api/events — SSE. `hello` sale antes de registrar al cliente en el
 * broadcaster: sin él, todo cliente que conecta necesita además un
 * GET /api/state y pinta datos vacíos mientras llega.
 */
export function createEventsRoute(deps: EventsRouteDeps): RouteHandler {
  return async ({ res }) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("retry: 2000\n\n");

    const hello = await deps.hello();
    res.write(`id: ${Date.now()}\n`);
    res.write("event: hello\n");
    res.write(`data: ${JSON.stringify(hello)}\n\n`);

    deps.broadcaster.register(res);
    res.on("close", () => deps.broadcaster.unregister(res));
  };
}
