import type { DatabaseSync } from "node:sqlite";
import type { RecordHookDeps } from "../../application/recordHook.ts";
import { DB_PATH, PORT } from "../../config.ts";
import { derivePetState } from "../../domain/petState.ts";
import { createHookRoute } from "../http/routes/hook.ts";
import { createUsageRoute } from "../http/routes/usage.ts";
import { createHttpServer } from "../http/server.ts";
import { ensureAccount } from "../persistence/accounts.ts";
import { openDb } from "../persistence/db.ts";
import { insertHookEvent } from "../persistence/hookEvents.ts";
import { startQuotaPoller } from "../poller.ts";
import { anthropicProvider } from "../providers/anthropic/index.ts";
import { createQuotaSampler } from "../quotaSampler.ts";

function makeHookDeps(db: DatabaseSync, accountId: number): RecordHookDeps {
  return {
    normalizeHookEvent: (raw) => anthropicProvider.normalizeHookEvent(raw),
    deriveState: (event) => derivePetState(event)?.state ?? null,
    insertHookEvent: (event) => insertHookEvent(db, { accountId, ...event }),
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

  const server = createHttpServer({
    routes: {
      "POST /api/hook/claude": createHookRoute(makeHookDeps(db, accountId)),
      "GET /api/usage": createUsageRoute(db, accountId),
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
