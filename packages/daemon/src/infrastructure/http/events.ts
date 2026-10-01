import type { ServerResponse } from "node:http";
import type { AmnisEvent } from "@amnis/shared";

export interface EventBroadcaster {
  /** El caller ya escribió las cabeceras y el `hello` inicial. */
  register(res: ServerResponse): void;
  unregister(res: ServerResponse): void;
  broadcast(event: AmnisEvent): void;
  clientCount(): number;
  /** Se dispara con el nuevo total en cada `register`/`unregister`. */
  onClientsChange(listener: (count: number) => void): void;
  stop(): void;
}

/**
 * Registro de clientes SSE + difusión. `id:` con timestamp para que la
 * reconexión mande `Last-Event-ID` (docs/STACK.md §4) — sin replay de lo
 * perdido en el MVP: si el daemon murió no hay memoria que reproducir, y
 * `hello` ya da el estado correcto en cada reconexión.
 *
 * Heartbeat (comentario SSE) cada `heartbeatMs` para mantener vivas las
 * conexiones a través de proxies/timeouts intermedios. `heartbeatMs`
 * inyectable, mismo patrón que `intervalMs` en poller.ts, para tests.
 */
export function createEventBroadcaster(heartbeatMs = 30_000): EventBroadcaster {
  const clients = new Set<ServerResponse>();

  function write(res: ServerResponse, event: AmnisEvent): void {
    res.write(`id: ${Date.now()}\n`);
    res.write(`event: ${event.event}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  }

  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(": heartbeat\n\n");
  }, heartbeatMs);
  heartbeat.unref();

  const listeners: Array<(count: number) => void> = [];
  const notify = () => {
    for (const listener of listeners) listener(clients.size);
  };

  return {
    register(res) {
      clients.add(res);
      notify();
    },
    unregister(res) {
      // `unregister` también llega para clientes que nunca se registraron
      // (cierran antes del `hello`): no es un cambio, no se notifica.
      if (clients.delete(res)) notify();
    },
    broadcast(event) {
      for (const res of clients) write(res, event);
    },
    clientCount: () => clients.size,
    onClientsChange(listener) {
      listeners.push(listener);
    },
    stop() {
      clearInterval(heartbeat);
    },
  };
}
