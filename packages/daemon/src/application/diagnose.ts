/**
 * `amnis doctor` (#35): convertir hechos ya recogidos por el CLI (I/O, red,
 * fs) en un diagnóstico. Pura a propósito — lo valioso de la issue son los
 * mensajes y sus remedios, y eso debe poder testearse sin tocar disco ni
 * red. `application/` no importa `config.ts` (ver sampleQuota.ts): el
 * puerto y el umbral de frescura entran como datos, nunca como import.
 */

import { type DaemonMessage, type HealthCheck, msg } from "@amnis/shared";

/** Sin actividad de ingesta más allá de esto, se considera obsoleta. */
export const STALE_INGEST_MS = 24 * 60 * 60_000;

export type Check = HealthCheck;

/**
 * Lo que solo sabe el daemon (#98): cómo fue su última ingesta automática.
 * `staleAfterMs` entra como dato (`application/` no importa `config.ts`).
 */
export interface AutoIngestFacts {
  /** `null` mientras no ha terminado la primera pasada tras arrancar. */
  lastRun: { at: Date; error: string | null } | null;
  staleAfterMs: number;
}

export interface DiagnoseFacts {
  daemonAlive: boolean;
  /** Eventos donde hay al menos un matcher marcado como Amnis. */
  amnisHookEvents: readonly string[];
  /** Los que `install-hooks` registra hoy: PreToolUse, Notification, Stop, SessionStart, SessionEnd. */
  expectedHookEvents: readonly string[];
  credentials:
    | { ok: true; expiresAt: number | null }
    | { ok: false; message: DaemonMessage };
  quotaError: DaemonMessage | null;
  dbError: string | null;
  lastIngestAt: Date | null;
  /** Solo el daemon lo rellena; el CLI no ingiere solo y usa `lastIngestAt`. */
  autoIngest?: AutoIngestFacts;
  spotify: {
    hasClientId: boolean;
    token: "none" | "valid" | "expired-refreshable";
    redirectUri: string;
  };
}

function checkDaemon(facts: DiagnoseFacts): Check {
  if (facts.daemonAlive) {
    return {
      name: "daemon",
      ok: true,
      message: msg("health.daemon.ok"),
      remedy: null,
    };
  }
  return {
    name: "daemon",
    ok: false,
    message: msg("health.daemon.down"),
    remedy: msg("health.daemon.remedy"),
  };
}

function checkHooks(facts: DiagnoseFacts): Check {
  const missing = facts.expectedHookEvents.filter(
    (event) => !facts.amnisHookEvents.includes(event),
  );
  if (missing.length === 0) {
    return {
      name: "hooks",
      ok: true,
      message: msg("health.hooks.ok"),
      remedy: null,
    };
  }
  return {
    name: "hooks",
    ok: false,
    message: msg("health.hooks.missing", { events: missing.join(", ") }),
    remedy: msg("health.hooks.remedy"),
  };
}

function checkCredentials(facts: DiagnoseFacts): Check {
  if (facts.credentials.ok) {
    return {
      name: "credenciales",
      ok: true,
      message: msg("health.credentials.ok"),
      remedy: null,
    };
  }
  return {
    name: "credenciales",
    ok: false,
    message: facts.credentials.message,
    remedy: msg("health.claudeLogin"),
  };
}

function checkToken(facts: DiagnoseFacts, now: Date): Check {
  if (!facts.credentials.ok) {
    return {
      name: "token",
      ok: false,
      message: msg("health.token.unchecked"),
      remedy: msg("health.claudeLogin"),
    };
  }
  // Caducado no es un fallo: Amnis no refresca el token (#136) y Claude Code
  // lo renueva en cuanto se vuelve a usar. Marcarlo ✗ sería falsa alarma
  // tras cualquier rato sin usarlo.
  return {
    name: "token",
    ok: true,
    message: tokenExpired(facts, now)
      ? msg("health.token.expired")
      : msg("health.token.ok"),
    remedy: null,
  };
}

function tokenExpired(facts: DiagnoseFacts, now: Date): boolean {
  if (!facts.credentials.ok) return false;
  const { expiresAt } = facts.credentials;
  return expiresAt !== null && now.getTime() >= expiresAt;
}

function checkEndpoint(facts: DiagnoseFacts, now: Date): Check {
  // Con el token caducado no se consulta: el motivo ya lo da el chequeo de
  // token, y repetirlo aquí como fallo sería la misma falsa alarma.
  if (tokenExpired(facts, now)) {
    return {
      name: "endpoint",
      ok: true,
      message: msg("health.endpoint.waiting"),
      remedy: null,
    };
  }
  if (facts.quotaError === null) {
    return {
      name: "endpoint",
      ok: true,
      message: msg("health.endpoint.ok"),
      remedy: null,
    };
  }
  return {
    name: "endpoint",
    ok: false,
    message: facts.quotaError,
    remedy: msg("health.endpoint.remedy"),
  };
}

function checkDb(facts: DiagnoseFacts): Check {
  if (facts.dbError === null) {
    return {
      name: "base de datos",
      ok: true,
      message: msg("health.db.ok"),
      remedy: null,
    };
  }
  return {
    name: "base de datos",
    ok: false,
    message: msg("raw", { text: facts.dbError }),
    remedy: msg("health.db.remedy"),
  };
}

function checkAutoIngest(auto: AutoIngestFacts, now: Date): Check {
  const { lastRun, staleAfterMs } = auto;
  if (lastRun === null) {
    return {
      name: "ingesta",
      ok: true,
      message: msg("health.ingest.firstRun"),
      remedy: null,
    };
  }
  if (lastRun.error !== null) {
    return {
      name: "ingesta",
      ok: false,
      message: msg("health.ingest.autoFailed", { detail: lastRun.error }),
      remedy: msg("health.ingest.autoFailedRemedy"),
    };
  }
  if (now.getTime() - lastRun.at.getTime() > staleAfterMs) {
    return {
      name: "ingesta",
      ok: false,
      message: msg("health.ingest.autoStale", {
        minutes: Math.round(staleAfterMs / 60_000),
      }),
      remedy: msg("health.ingest.autoStaleRemedy"),
    };
  }
  return {
    name: "ingesta",
    ok: true,
    message: msg("health.ingest.autoOk"),
    remedy: null,
  };
}

function checkIngest(facts: DiagnoseFacts, now: Date): Check {
  if (facts.autoIngest) return checkAutoIngest(facts.autoIngest, now);
  if (facts.lastIngestAt === null) {
    return {
      name: "ingesta",
      ok: false,
      message: msg("health.ingest.never"),
      remedy: msg("health.ingest.run"),
    };
  }
  const ageMs = now.getTime() - facts.lastIngestAt.getTime();
  if (ageMs <= STALE_INGEST_MS) {
    return {
      name: "ingesta",
      ok: true,
      message: msg("health.ingest.recent"),
      remedy: null,
    };
  }
  return {
    name: "ingesta",
    ok: false,
    message: msg("health.ingest.stale", {
      hours: STALE_INGEST_MS / 3_600_000,
    }),
    remedy: msg("health.ingest.run"),
  };
}

function checkSpotify(facts: DiagnoseFacts): Check {
  const { hasClientId, token, redirectUri } = facts.spotify;
  // Spotify es opcional: sin Client ID no es un fallo, o `doctor` saldría
  // con código 1 para quien no lo usa.
  if (!hasClientId) {
    return {
      name: "spotify",
      ok: true,
      message: msg("health.spotify.notConfigured", { uri: redirectUri }),
      remedy: null,
    };
  }
  if (token === "none") {
    return {
      name: "spotify",
      ok: false,
      message: msg("health.spotify.notLoggedIn"),
      remedy: msg("health.spotify.loginRemedy", { uri: redirectUri }),
    };
  }
  return {
    name: "spotify",
    ok: true,
    message: msg("health.spotify.ok", { uri: redirectUri }),
    remedy: null,
  };
}

export function diagnose(facts: DiagnoseFacts, now: Date): Check[] {
  return [
    checkDaemon(facts),
    checkHooks(facts),
    checkCredentials(facts),
    checkToken(facts, now),
    checkEndpoint(facts, now),
    checkDb(facts),
    checkIngest(facts, now),
    checkSpotify(facts),
  ];
}
