import type { DatabaseSync } from "node:sqlite";
import {
  fatigueFrom,
  type GetStateDeps,
  getState,
  quotaExhausted,
} from "../../application/getState.ts";
import { repairHooks } from "../../application/installHooks.ts";
import type { RecordHookDeps } from "../../application/recordHook.ts";
import { refreshPrices } from "../../application/refreshPrices.ts";
import {
  AMNIS_DEV_ORIGIN,
  DB_PATH,
  PORT,
  QUOTA_POLL_MS,
  RESOURCES,
  SPOTIFY_REDIRECT_URI,
  VERSION,
} from "../../config.ts";
import { derivePetState } from "../../domain/petState.ts";
import { makeRepairHooksDeps } from "../claudeSettings.ts";
import { currentPlan } from "../currentPlan.ts";
import { gatherDiagnoseFacts } from "../doctorFacts.ts";
import { readCommitHash, resolveCheckout } from "../git.ts";
import { createEventBroadcaster } from "../http/events.ts";
import { createActivityRoutes } from "../http/routes/activity.ts";
import { createDashboardRoute } from "../http/routes/dashboard.ts";
import { createEventsRoute } from "../http/routes/events.ts";
import { createHealthRoute } from "../http/routes/health.ts";
import { createHookRoute } from "../http/routes/hook.ts";
import { createHooksRoutes } from "../http/routes/hooks.ts";
import { createIngestRoutes } from "../http/routes/ingest.ts";
import { createMediaRoutes } from "../http/routes/media.ts";
import { createQuotaHistoryRoutes } from "../http/routes/quotaHistory.ts";
import { createQuotaRefreshRoute } from "../http/routes/quotaRefresh.ts";
import { createSessionsRoutes } from "../http/routes/sessions.ts";
import { createSettingsRoutes } from "../http/routes/settings.ts";
import { createSpotifyRoutes } from "../http/routes/spotify.ts";
import { createStateRoute } from "../http/routes/state.ts";
import { createUsageRoute } from "../http/routes/usage.ts";
import { createHttpServer } from "../http/server.ts";
import { createStaticRoute } from "../http/static.ts";
import { spawnIngest } from "../ingestProcess.ts";
import { createIngestRunner, type IngestRunner } from "../ingestRunner.ts";
import { startMediaPoller } from "../mediaPoller.ts";
import { openBrowser } from "../openBrowser.ts";
import { ensureAccount } from "../persistence/accounts.ts";
import { openDb } from "../persistence/db.ts";
import {
  countHookEvents,
  insertHookEvent,
  lastKnownStateEvent,
} from "../persistence/hookEvents.ts";
import { savePrices } from "../persistence/prices.ts";
import { readSettings, writeSettings } from "../persistence/settings.ts";
import {
  deleteSpotifyToken,
  readSpotifyConfig,
  writeSpotifyToken,
} from "../persistence/spotifyToken.ts";
import { countUsageEvents } from "../persistence/usageEvents.ts";
import { startPetStateWatcher } from "../petStateWatcher.ts";
import { startQuotaPoller } from "../poller.ts";
import { startPricesRefresher } from "../pricesRefresher.ts";
import { anthropicProvider } from "../providers/anthropic/index.ts";
import { fetchPrices } from "../providers/anthropic/pricing.ts";
import { providers } from "../providers/index.ts";
import { fetchFeatures } from "../providers/reccobeats/features.ts";
import { createMediaControl } from "../providers/spotify/control.ts";
import { exchangeCode } from "../providers/spotify/oauth.ts";
import { readMedia } from "../providers/spotify/player.ts";
import { createQuotaSampler } from "../quotaSampler.ts";
import { createTrackVibes } from "../trackVibe.ts";

function makeHookDeps(
  db: DatabaseSync,
  accountId: number,
  onInserted: () => void,
): RecordHookDeps {
  return {
    normalizeHookEvent: (raw) => anthropicProvider.normalizeHookEvent(raw),
    deriveState: (event) => derivePetState(event)?.state ?? null,
    resolveCheckout,
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
  media: GetStateDeps["media"],
  listening: GetStateDeps["listening"],
  settings: GetStateDeps["settings"],
  ingest: IngestRunner,
): GetStateDeps {
  const plan = () => currentPlan(settings().plan);
  const quotaSamplers = providers.map((provider) =>
    createQuotaSampler(
      db,
      accountId,
      provider,
      () => plan()?.id ?? null,
      ingest.ensureFresh,
    ),
  );
  return {
    version: VERSION,
    startedAt,
    lastKnownStateEvent: () => lastKnownStateEvent(db, accountId),
    countHookEvents: () => countHookEvents(db, accountId),
    countUsageEvents: () => countUsageEvents(db, accountId),
    sampleQuotas: () => Promise.all(quotaSamplers.map((sample) => sample())),
    media,
    listening,
    settings,
    plan,
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
  // Preferencias de la capa de música: en memoria, con `~/.amnis/settings.json`
  // como copia. Un fichero estropeado arranca con los valores por defecto.
  let settings = readSettings();
  // Sin clientes SSE no se consulta Spotify: el ciclo lo arranca el primer
  // cliente y se apaga solo al irse el último (mediaPoller.ts).
  const mediaPoller = startMediaPoller({
    read: readMedia,
    vibes: createTrackVibes({ fetchFeatures }),
    hasClients: () => broadcaster.clientCount() > 0,
    onChange: (snapshot) => {
      broadcaster.broadcast({ event: "media", data: snapshot });
      // Cambio de pista, pausa o vibe que llega tarde: `listening` al día.
      watcher.check();
    },
  });
  broadcaster.onClientsChange((count) => {
    if (count > 0) mediaPoller.wake();
  });
  // Un solo proceso de ingesta a la vez (#98): la pasada automática de antes de
  // cada muestra de cuota y la reconstrucción comparten ejecutor.
  const ingest = createIngestRunner({ spawn: spawnIngest });
  const stateDeps = makeStateDeps(
    db,
    accountId,
    startedAt,
    () => mediaPoller.snapshot(),
    () => {
      watcher.check();
      return watcher.listening();
    },
    () => settings,
    ingest,
  );

  // Cacheadas del último poll de cuota: un `state` disparado por hooks no
  // debe pagar un poll en vivo (PreToolUse dispara muchísimo).
  let cachedFatigue = 0;
  let cachedExhausted = false;
  const watcher = startPetStateWatcher({
    lastKnownStateEvent: stateDeps.lastKnownStateEvent,
    startedAt,
    getCachedFatigue: () => cachedFatigue,
    getCachedExhausted: () => cachedExhausted,
    getCachedMedia: () => mediaPoller.peek(),
    readCommitHash,
    broadcast: (snapshot) =>
      broadcaster.broadcast({ event: "state", data: snapshot }),
  });

  const sample = createQuotaSampler(
    db,
    accountId,
    anthropicProvider,
    () => currentPlan(settings.plan)?.id ?? null,
    ingest.ensureFresh,
  );
  // Último error del poller, en memoria: `/api/health` lo da sin pagar un
  // poll en vivo (el CLI, que no lo tiene, sí lo hace).
  let lastQuotaError: string | null = null;
  const poller = startQuotaPoller({
    sample,
    onSample: (snapshot) => {
      lastQuotaError = snapshot.error;
      cachedFatigue = fatigueFrom([snapshot]);
      cachedExhausted = quotaExhausted([snapshot]);
      broadcaster.broadcast({ event: "quota", data: [snapshot] });
      // Entrar/salir de `limited` no debe esperar hasta 30s al
      // temporizador del watcher — deduplica por `state`, así que llamar
      // sin cambio real no emite nada de más.
      watcher.check();
    },
    onError: (err) => {
      lastQuotaError = err.message;
      console.error("Fallo muestreando cuota:", err.message);
    },
  });

  // Un fallo no toca la tabla guardada: siguen valiendo los últimos
  // precios buenos (o la semilla de domain/cost.ts).
  const pricesRefresher = startPricesRefresher({
    refresh: () =>
      refreshPrices(
        {
          fetchPrices: () => fetchPrices(),
          savePrices: (prices, fetchedAt) => savePrices(db, prices, fetchedAt),
        },
        new Date(),
      ),
    onError: (message) => console.error("Fallo actualizando precios:", message),
  });

  const server = createHttpServer({
    devOrigin: AMNIS_DEV_ORIGIN,
    routes: {
      "GET /debug": createDashboardRoute(),
      "POST /api/hook/claude": createHookRoute(
        makeHookDeps(db, accountId, () => watcher.check()),
      ),
      "GET /api/usage": createUsageRoute(db, accountId),
      ...createQuotaHistoryRoutes(db, accountId),
      ...createActivityRoutes(db, accountId),
      ...createSessionsRoutes(db, accountId),
      "GET /api/state": createStateRoute(stateDeps),
      "GET /api/health": createHealthRoute({
        facts: () =>
          gatherDiagnoseFacts(
            {
              // Dentro del daemon, estar vivo es trivialmente cierto.
              daemonAlive: async () => true,
              quotaError: async () => lastQuotaError,
              autoIngest: () => ({
                lastRun: ingest.lastRun(),
                staleAfterMs: 2 * QUOTA_POLL_MS,
              }),
              db,
            },
            new Date(),
          ),
        daemon: () => ({
          version: VERSION,
          startedAt,
          eventsReceived: countHookEvents(db, accountId),
        }),
      }),
      ...createHooksRoutes(() => repairHooks(makeRepairHooksDeps())),
      ...createIngestRoutes({
        rebuild: () => ingest.rebuild(),
        broadcast: (data) => broadcaster.broadcast({ event: "rebuild", data }),
      }),
      "POST /api/quota/refresh": createQuotaRefreshRoute(poller.pollNow),
      "GET /api/events": createEventsRoute({
        broadcaster,
        hello: () => getState(stateDeps, new Date()),
      }),
      ...createSpotifyRoutes({
        readClientId: () => readSpotifyConfig()?.clientId ?? null,
        redirectUri: SPOTIFY_REDIRECT_URI,
        openBrowser,
        exchangeCode,
        saveToken: (token) => {
          writeSpotifyToken(token);
          // Recién conectado: que la UI vea qué suena ya, no en 30 s.
          mediaPoller.pollNow();
        },
        logout: () => {
          deleteSpotifyToken();
          // Una lectura en vuelo es anterior al logout: la siguiente, ya, da
          // `not-logged-in` y llega a la UI por SSE sin reiniciar.
          mediaPoller.pollSoon(0);
        },
      }),
      ...createSettingsRoutes({
        get: () => settings,
        save: (next) => {
          writeSettings(next);
          settings = next;
          // La mascota y el dashboard las aplican en vivo, sin reiniciar.
          broadcaster.broadcast({ event: "settings", data: next });
        },
      }),
      ...createMediaRoutes({
        control: createMediaControl(),
        // Spotify tarda unos cientos de ms en reflejar la orden.
        afterAction: () => mediaPoller.pollSoon(),
        refresh: () => mediaPoller.refresh(),
      }),
    },
    fallback: createStaticRoute(RESOURCES.webDist),
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    poller.stop();
    pricesRefresher.stop();
    watcher.stop();
    mediaPoller.stop();
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
