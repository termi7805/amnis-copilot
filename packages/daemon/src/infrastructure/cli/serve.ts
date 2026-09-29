import type { DatabaseSync } from "node:sqlite";
import {
  fatigueFrom,
  type GetStateDeps,
  getState,
  quotaExhausted,
} from "../../application/getState.ts";
import type { RecordHookDeps } from "../../application/recordHook.ts";
import { DB_PATH, PORT, RESOURCES, VERSION } from "../../config.ts";
import { derivePetState } from "../../domain/petState.ts";
import { readCommitHash } from "../git.ts";
import { createEventBroadcaster } from "../http/events.ts";
import { createDashboardRoute } from "../http/routes/dashboard.ts";
import { createEventsRoute } from "../http/routes/events.ts";
import { createHookRoute } from "../http/routes/hook.ts";
import { createQuotaRefreshRoute } from "../http/routes/quotaRefresh.ts";
import { createStateRoute } from "../http/routes/state.ts";
import { createUsageRoute } from "../http/routes/usage.ts";
import { createHttpServer } from "../http/server.ts";
import { createStaticRoute } from "../http/static.ts";
import { ensureAccount } from "../persistence/accounts.ts";
import { openDb } from "../persistence/db.ts";
import {
  countHookEvents,
  insertHookEvent,
  lastKnownStateEvent,
} from "../persistence/hookEvents.ts";
import { countUsageEvents } from "../persistence/usageEvents.ts";
import { startPetStateWatcher } from "../petStateWatcher.ts";
import { startQuotaPoller } from "../poller.ts";
import { anthropicProvider } from "../providers/anthropic/index.ts";
import { providers } from "../providers/index.ts";
import { createQuotaSampler } from "../quotaSampler.ts";

function makeHookDeps(
  db: DatabaseSync,
  accountId: number,
  onInserted: () => void,
): RecordHookDeps {
  return {
    normalizeHookEvent: (raw) => anthropicProvider.normalizeHookEvent(raw),
    deriveState: (event) => derivePetState(event)?.state ?? null,
    insertHookEvent: (event) => {
      insertHookEvent(db, { accountId, ...event });
      onInserted();
    },
  };
}

function makeStateDeps(
  db: DatabaseSync,
  accountId: number,
  startedAt: string,
): GetStateDeps {
  const quotaSamplers = providers.map((provider) =>
    createQuotaSampler(db, accountId, provider),
  );
  return {
    version: VERSION,
    startedAt,
    lastKnownStateEvent: () => lastKnownStateEvent(db, accountId),
    countHookEvents: () => countHookEvents(db, accountId),
    countUsageEvents: () => countUsageEvents(db, accountId),
    sampleQuotas: () => Promise.all(quotaSamplers.map((sample) => sample())),
    readCommitHash,
  };
}

/**
 * Composition root: abre la BD, monta las rutas HTTP que ya existen y
 * levanta el poller de cuota y el watcher de estado. Cierre limpio en
 * SIGINT/SIGTERM — si no, el proceso no libera el puerto (server.ts
 * `close()` lo exige).
 */
export function runServeCli(args: readonly string[] = []): void {
  const db = openDb(DB_PATH);
  const accountId = ensureAccount(db, "anthropic", "default");
  const startedAt = new Date().toISOString();

  const broadcaster = createEventBroadcaster();
  const stateDeps = makeStateDeps(db, accountId, startedAt);

  // Cacheadas del último poll de cuota: un `state` disparado por hooks no
  // debe pagar un poll en vivo (PreToolUse dispara muchísimo).
  let cachedFatigue = 0;
  let cachedExhausted = false;
  const watcher = startPetStateWatcher({
    lastKnownStateEvent: stateDeps.lastKnownStateEvent,
    startedAt,
    getCachedFatigue: () => cachedFatigue,
    getCachedExhausted: () => cachedExhausted,
    readCommitHash,
    broadcast: (snapshot) =>
      broadcaster.broadcast({ event: "state", data: snapshot }),
  });

  const sample = createQuotaSampler(db, accountId, anthropicProvider);
  const poller = startQuotaPoller({
    sample,
    onSample: (snapshot) => {
      cachedFatigue = fatigueFrom([snapshot]);
      cachedExhausted = quotaExhausted([snapshot]);
      broadcaster.broadcast({ event: "quota", data: [snapshot] });
      // Entrar/salir de `limited` no debe esperar hasta 30s al
      // temporizador del watcher — deduplica por `state`, así que llamar
      // sin cambio real no emite nada de más.
      watcher.check();
    },
    onError: (err) => console.error("Fallo muestreando cuota:", err.message),
  });

  const server = createHttpServer({
    routes: {
      "GET /debug": createDashboardRoute(),
      "POST /api/hook/claude": createHookRoute(
        makeHookDeps(db, accountId, () => watcher.check()),
      ),
      "GET /api/usage": createUsageRoute(db, accountId),
      "GET /api/state": createStateRoute(stateDeps),
      "POST /api/quota/refresh": createQuotaRefreshRoute(poller.pollNow),
      "GET /api/events": createEventsRoute({
        broadcaster,
        hello: () => getState(stateDeps, new Date()),
      }),
    },
    fallback: createStaticRoute(RESOURCES.webDist),
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    poller.stop();
    watcher.stop();
    broadcaster.stop();
    server
      .close()
      .then(() => db.close())
      .catch((err) => console.error("Error al cerrar:", err))
      .finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // La app de Tauri lanza el daemon como sidecar con un pipe en stdin (#41).
  // Si la app muere sin cerrar limpio (SIGTERM, cierre de sesión, crash),
  // el kernel cierra su extremo del pipe y aquí llega EOF: sin esto el
  // daemon quedaba huérfano escuchando en el puerto (medido).
  if (args.includes("--exit-with-parent")) {
    process.stdin.on("end", shutdown);
    process.stdin.resume();
  }

  server.listen(PORT).then((port) => {
    console.log(`amnis-daemon escuchando en http://127.0.0.1:${port}`);
  });
}
