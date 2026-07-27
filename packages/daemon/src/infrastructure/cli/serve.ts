import type { DatabaseSync } from "node:sqlite";
import type { GetStateDeps } from "../../application/getState.ts";
import type { RecordHookDeps } from "../../application/recordHook.ts";
import { DB_PATH, PORT, VERSION } from "../../config.ts";
import { derivePetState } from "../../domain/petState.ts";
import { createHookRoute } from "../http/routes/hook.ts";
import { createStateRoute } from "../http/routes/state.ts";
import { createUsageRoute } from "../http/routes/usage.ts";
import { createHttpServer } from "../http/server.ts";
import { ensureAccount } from "../persistence/accounts.ts";
import { openDb } from "../persistence/db.ts";
import {
  countHookEvents,
  insertHookEvent,
  lastKnownStateEvent,
} from "../persistence/hookEvents.ts";
import { countUsageEvents } from "../persistence/usageEvents.ts";
import { startQuotaPoller } from "../poller.ts";
import { anthropicProvider } from "../providers/anthropic/index.ts";
import { providers } from "../providers/index.ts";
import { createQuotaSampler } from "../quotaSampler.ts";

function makeHookDeps(db: DatabaseSync, accountId: number): RecordHookDeps {
  return {
    normalizeHookEvent: (raw) => anthropicProvider.normalizeHookEvent(raw),
    deriveState: (event) => derivePetState(event)?.state ?? null,
    insertHookEvent: (event) => insertHookEvent(db, { accountId, ...event }),
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
  };
}

/**
 * Composition root: abre la BD, monta las rutas HTTP que ya existen y
 * levanta el poller de cuota. Cierre limpio en SIGINT/SIGTERM — si no,
 * el proceso no libera el puerto (server.ts `close()` lo exige).
 */
export function runServeCli(): void {
  const db = openDb(DB_PATH);
  const accountId = ensureAccount(db, "anthropic", "default");
  const startedAt = new Date().toISOString();

  const server = createHttpServer({
    routes: {
      "POST /api/hook/claude": createHookRoute(makeHookDeps(db, accountId)),
      "GET /api/usage": createUsageRoute(db, accountId),
      "GET /api/state": createStateRoute(
        makeStateDeps(db, accountId, startedAt),
      ),
    },
  });

  const sample = createQuotaSampler(db, accountId, anthropicProvider);
  const stopPoller = startQuotaPoller({
    sample,
    onError: (err) => console.error("Fallo muestreando cuota:", err.message),
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopPoller();
    server
      .close()
      .then(() => db.close())
      .catch((err) => console.error("Error al cerrar:", err))
      .finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  server.listen(PORT).then((port) => {
    console.log(`amnis-daemon escuchando en http://127.0.0.1:${port}`);
  });
}
