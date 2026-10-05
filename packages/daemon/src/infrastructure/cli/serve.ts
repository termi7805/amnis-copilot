import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import {
  type AmnisSettings,
  type DaemonMessage,
  msg,
  type PetFocus,
} from "@amnis/shared";
import { checkUpdate } from "../../application/checkUpdate.ts";
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
  CLAUDE_SKILL_DIR,
  DB_PATH,
  PORT,
  PRICES_REFRESH_MS,
  QUOTA_POLL_MS,
  RESOURCES,
  SKINS_DIR,
  SPOTIFY_REDIRECT_URI,
  UPDATE_CHECK_MS,
  VERSION,
} from "../../config.ts";
import { type FocusFacts, focusAfter } from "../../domain/petFocus.ts";
import { derivePetState } from "../../domain/petState.ts";
import { makeRepairHooksDeps } from "../claudeSettings.ts";
import { installSkill, skillStatus } from "../claudeSkill.ts";
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
import { createShutdownRoute } from "../http/routes/shutdown.ts";
import { createSkillRoutes } from "../http/routes/skill.ts";
import { createSkinsRoutes } from "../http/routes/skins.ts";
import { acceptLanguage, createSpotifyRoutes } from "../http/routes/spotify.ts";
import { createStateRoute } from "../http/routes/state.ts";
import { createUsageRoute } from "../http/routes/usage.ts";
import { createHttpServer } from "../http/server.ts";
import { createStaticRoute } from "../http/static.ts";
import { spawnIngest } from "../ingestProcess.ts";
import { createIngestRunner } from "../ingestRunner.ts";
import { startMediaPoller } from "../mediaPoller.ts";
import { openBrowser } from "../openBrowser.ts";
import { ensureAccount } from "../persistence/accounts.ts";
import { openDb } from "../persistence/db.ts";
import {
  countHookEvents,
  insertHookEvent,
  lastKnownStateEvent,
  liveSessionCandidates,
  sessionStatus,
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
import { anthropicProvider } from "../providers/anthropic/index.ts";
import { fetchPrices } from "../providers/anthropic/pricing.ts";
import { fetchLatestRelease } from "../providers/github/releases.ts";
import { fetchFeatures } from "../providers/reccobeats/features.ts";
import { createMediaControl } from "../providers/spotify/control.ts";
import { exchangeCode } from "../providers/spotify/oauth.ts";
import { readMedia } from "../providers/spotify/player.ts";
import { createQuotaSampler } from "../quotaSampler.ts";
import { startRefresher } from "../refresher.ts";
import { startSkinCatalog } from "../skinCatalog.ts";
import { createTrackVibes } from "../trackVibe.ts";
import { createUpdateChecker } from "../updateChecker.ts";

function makeHookDeps(
  db: DatabaseSync,
  accountId: number,
  onInserted: () => void,
  focus: Pick<RecordHookDeps, "focus" | "focusFacts" | "setFocus">,
): RecordHookDeps {
  return {
    normalizeHookEvent: (raw) => anthropicProvider.normalizeHookEvent(raw),
    deriveState: (event) => derivePetState(event)?.state ?? null,
    resolveCheckout,
    ...focus,
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
  skins: GetStateDeps["skins"],
  latestQuotas: GetStateDeps["latestQuotas"],
  update: GetStateDeps["update"],
): GetStateDeps {
  const plan = () => currentPlan(settings().plan);
  return {
    version: VERSION,
    update,
    startedAt,
    focus: () => settings().petFocus,
    lastKnownStateEvent: (focus) => lastKnownStateEvent(db, accountId, focus),
    liveSessionCandidates: (since) =>
      liveSessionCandidates(db, accountId, since),
    countHookEvents: () => countHookEvents(db, accountId),
    countUsageEvents: () => countUsageEvents(db, accountId),
    latestQuotas,
    media,
    listening,
    settings,
    skins,
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
  // La carpeta de skins se vigila: borrar o romper la elegida llega a la
  // mascota abierta por SSE, sin que nadie pulse nada.
  const skinCatalog = startSkinCatalog({
    root: SKINS_DIR,
    onChange: (data) => broadcaster.broadcast({ event: "skins", data }),
  });
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
    () => skinCatalog.snapshot(),
    // El poller se crea después (necesita el watcher): cierre perezoso.
    () => poller.current().then((snapshot) => [snapshot]),
    () => updateChecker.current(),
  );

  // Cacheadas del último poll de cuota: un `state` disparado por hooks no
  // debe pagar un poll en vivo (PreToolUse dispara muchísimo).
  let cachedFatigue = 0;
  let cachedExhausted = false;
  // El foco se suelta por el mismo camino que un cambio de ajustes: si no, el
  // dashboard seguiría enseñando un foco que el daemon ya no aplica (#110).
  const saveSettings = (next: AmnisSettings): void => {
    const toggledUpdates = next.checkUpdates !== settings.checkUpdates;
    writeSettings(next);
    settings = next;
    // Encendido busca ya; apagado borra el aviso sin esperar 6 h.
    if (toggledUpdates) updateRefresher.runNow();
    // La mascota y el dashboard las aplican en vivo, sin reiniciar.
    broadcaster.broadcast({ event: "settings", data: next });
    // Otro foco es otro estado: el snapshot sale ya, sin esperar a un
    // hook ni al temporizador del watcher.
    watcher.check();
  };
  const focusControl = {
    focus: stateDeps.focus,
    focusFacts: (focus: PetFocus): FocusFacts => ({
      session:
        focus.kind === "session"
          ? sessionStatus(db, accountId, focus.sessionId, new Date())
          : "alive",
      worktreeExists: focus.kind !== "worktree" || existsSync(focus.worktree),
    }),
    setFocus: (petFocus: PetFocus) => saveSettings({ ...settings, petFocus }),
  };
  const watcher = startPetStateWatcher({
    reconcileFocus: () => {
      const focus = settings.petFocus;
      const next = focusAfter(focus, null, focusControl.focusFacts(focus));
      if (JSON.stringify(next) !== JSON.stringify(focus)) {
        focusControl.setFocus(next);
      }
    },
    focus: stateDeps.focus,
    lastKnownStateEvent: stateDeps.lastKnownStateEvent,
    liveSessionCandidates: stateDeps.liveSessionCandidates,
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
  let lastQuotaError: DaemonMessage | null = null;
  const poller = startQuotaPoller({
    sample: (previous) => sample(previous),
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
      lastQuotaError = msg("raw", { text: err.message });
      console.error("Fallo muestreando cuota:", err.message);
    },
  });

  // Un fallo no toca la tabla guardada: siguen valiendo los últimos
  // precios buenos (o la semilla de domain/cost.ts).
  const pricesRefresher = startRefresher({
    intervalMs: PRICES_REFRESH_MS,
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

  const updateChecker = createUpdateChecker({
    check: () =>
      checkUpdate({
        fetchLatest: () => fetchLatestRelease(),
        currentVersion: VERSION,
      }),
    enabled: () => settings.checkUpdates,
    onChange: (update) =>
      broadcaster.broadcast({ event: "update", data: update }),
  });
  const updateRefresher = startRefresher({
    intervalMs: UPDATE_CHECK_MS,
    refresh: () => updateChecker.refresh(),
    onError: (message) =>
      console.error("Fallo buscando actualizaciones:", message),
  });

  const server = createHttpServer({
    devOrigin: AMNIS_DEV_ORIGIN,
    routes: {
      "GET /debug": createDashboardRoute(),
      "POST /api/hook/claude": createHookRoute(
        makeHookDeps(db, accountId, () => watcher.check(), focusControl),
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
      "POST /api/shutdown": createShutdownRoute({
        broadcastQuit: () =>
          broadcaster.broadcast({ event: "quit", data: null }),
        shutdown: () => shutdown(),
      }),
      "GET /api/events": createEventsRoute({
        broadcaster,
        hello: () => getState(stateDeps, new Date()),
      }),
      ...createSpotifyRoutes({
        readClientId: () => readSpotifyConfig()?.clientId ?? null,
        language: (req) =>
          settings.locale === "system" ? acceptLanguage(req) : settings.locale,
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
      ...createSkillRoutes({
        status: () => skillStatus(RESOURCES.skillDir, CLAUDE_SKILL_DIR),
        install: () => installSkill(RESOURCES.skillDir, CLAUDE_SKILL_DIR),
      }),
      ...createSkinsRoutes(SKINS_DIR, skinCatalog.reload),
      ...createSettingsRoutes({
        get: () => settings,
        save: saveSettings,
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
    updateRefresher.stop();
    watcher.stop();
    mediaPoller.stop();
    skinCatalog.stop();
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
