/**
 * `amnis doctor` (#35): convertir hechos ya recogidos por el CLI (I/O, red,
 * fs) en un diagnóstico. Pura a propósito — lo valioso de la issue son los
 * mensajes y sus remedios, y eso debe poder testearse sin tocar disco ni
 * red. `application/` no importa `config.ts` (ver sampleQuota.ts): el
 * puerto y el umbral de frescura entran como datos, nunca como import.
 */

/** Sin actividad de ingesta más allá de esto, se considera obsoleta. */
export const STALE_INGEST_MS = 24 * 60 * 60_000;

export interface Check {
  name: string;
  ok: boolean;
  message: string;
  /** `null` solo cuando `ok`. Un fallo sin remedio es el ✗ inútil que la issue quiere evitar. */
  remedy: string | null;
}

export interface DiagnoseFacts {
  daemonAlive: boolean;
  /** Eventos donde hay al menos un matcher marcado como Amnis. */
  amnisHookEvents: readonly string[];
  /** Los que `install-hooks` registra hoy: PreToolUse, Notification, Stop. */
  expectedHookEvents: readonly string[];
  credentials:
    | { ok: true; expiresAt: number | null; hasRefreshToken: boolean }
    | { ok: false; message: string };
  quotaError: string | null;
  dbError: string | null;
  lastIngestAt: Date | null;
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
      message: "El daemon responde.",
      remedy: null,
    };
  }
  return {
    name: "daemon",
    ok: false,
    message: "El daemon no responde.",
    remedy: "Arráncalo con `amnis serve`.",
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
      message: "Los hooks de Amnis están instalados.",
      remedy: null,
    };
  }
  return {
    name: "hooks",
    ok: false,
    message: `Faltan hooks de Amnis: ${missing.join(", ")}.`,
    remedy: "Instálalos con `amnis install-hooks`.",
  };
}

function checkCredentials(facts: DiagnoseFacts): Check {
  if (facts.credentials.ok) {
    return {
      name: "credenciales",
      ok: true,
      message: "Las credenciales son legibles.",
      remedy: null,
    };
  }
  return {
    name: "credenciales",
    ok: false,
    message: facts.credentials.message,
    remedy: "Ejecuta `claude login`.",
  };
}

function checkToken(facts: DiagnoseFacts, now: Date): Check {
  if (!facts.credentials.ok) {
    return {
      name: "token",
      ok: false,
      message: "No se pudo comprobar: sin credenciales legibles.",
      remedy: "Ejecuta `claude login`.",
    };
  }
  const { expiresAt, hasRefreshToken } = facts.credentials;
  const expired = expiresAt !== null && now.getTime() >= expiresAt;
  // Caducado con refresh token disponible no es un fallo: Amnis lo renueva
  // solo (credentials.ts loadToken). Marcarlo ✗ sería falsa alarma en el
  // caso normal.
  if (!expired || hasRefreshToken) {
    return {
      name: "token",
      ok: true,
      message: "El token es válido o se renueva solo.",
      remedy: null,
    };
  }
  return {
    name: "token",
    ok: false,
    message: "El token caducó y no hay refresh token para renovarlo.",
    remedy: "Ejecuta `claude login`.",
  };
}

function checkEndpoint(facts: DiagnoseFacts): Check {
  if (facts.quotaError === null) {
    return {
      name: "endpoint",
      ok: true,
      message: "El endpoint de cuota responde.",
      remedy: null,
    };
  }
  return {
    name: "endpoint",
    ok: false,
    message: facts.quotaError,
    remedy: "Reintenta en unos minutos; si persiste, ejecuta `claude login`.",
  };
}

function checkDb(facts: DiagnoseFacts): Check {
  if (facts.dbError === null) {
    return {
      name: "base de datos",
      ok: true,
      message: "La base de datos es escribible.",
      remedy: null,
    };
  }
  return {
    name: "base de datos",
    ok: false,
    message: facts.dbError,
    remedy:
      "Revisa los permisos de ~/.amnis. Si el fichero está corrupto, bórralo y reinicia (se pierden la serie de cuota y los eventos de hook).",
  };
}

function checkIngest(facts: DiagnoseFacts, now: Date): Check {
  if (facts.lastIngestAt === null) {
    return {
      name: "ingesta",
      ok: false,
      message: "Nunca se ha ingerido nada.",
      remedy: "Ejecuta `amnis ingest`.",
    };
  }
  const ageMs = now.getTime() - facts.lastIngestAt.getTime();
  if (ageMs <= STALE_INGEST_MS) {
    return {
      name: "ingesta",
      ok: true,
      message: "La última ingesta es reciente.",
      remedy: null,
    };
  }
  return {
    name: "ingesta",
    ok: false,
    message: `La última ingesta fue hace más de ${STALE_INGEST_MS / 3_600_000}h.`,
    remedy: "Ejecuta `amnis ingest`.",
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
      message: `No configurado (opcional). Redirect URI a registrar: ${redirectUri}`,
      remedy: null,
    };
  }
  if (token === "none") {
    return {
      name: "spotify",
      ok: false,
      message: "Hay Client ID pero no has hecho login.",
      remedy: `Ejecuta \`amnis spotify login\`. El redirect URI de tu app debe ser exactamente ${redirectUri}`,
    };
  }
  return {
    name: "spotify",
    ok: true,
    message: `Sesión de Spotify activa. Redirect URI: ${redirectUri}`,
    remedy: null,
  };
}

export function diagnose(facts: DiagnoseFacts, now: Date): Check[] {
  return [
    checkDaemon(facts),
    checkHooks(facts),
    checkCredentials(facts),
    checkToken(facts, now),
    checkEndpoint(facts),
    checkDb(facts),
    checkIngest(facts, now),
    checkSpotify(facts),
  ];
}
