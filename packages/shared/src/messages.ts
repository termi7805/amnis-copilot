/**
 * Textos que genera el daemon y enseñan sus clientes. El daemon no manda
 * frases sino `{ key, params }`: quien muestra el mensaje lo formatea en su
 * idioma, y un cambio de idioma re-traduce lo que ya estaba en pantalla.
 * Lo que viene de fuera (`err.message`, el detalle de Spotify, rutas) va como
 * parámetro y no se traduce.
 */
export const DAEMON_MESSAGES_ES = {
  raw: "{{text}}",

  "health.daemon.ok": "El daemon responde.",
  "health.daemon.down": "El daemon no responde.",
  "health.daemon.remedy": "Arráncalo con `amnis serve`.",
  "health.hooks.ok": "Los hooks de Amnis están instalados.",
  "health.hooks.missing": "Faltan hooks de Amnis: {{events}}.",
  "health.hooks.remedy":
    "Instálalos o repáralos con `amnis install-hooks` o con el botón «Reparar hooks» de Ajustes.",
  "health.credentials.ok": "Las credenciales son legibles.",
  "health.claudeLogin": "Ejecuta `claude login`.",
  "health.token.unchecked": "No se pudo comprobar: sin credenciales legibles.",
  "health.token.expired":
    "Caducado: Claude Code lo renueva en cuanto vuelvas a usarlo. Mientras, el % es una estimación local.",
  "health.token.ok": "El token es válido.",
  "health.endpoint.waiting":
    "Sin consultar hasta que Claude Code renueve el token.",
  "health.endpoint.ok": "El endpoint de cuota responde.",
  "health.endpoint.remedy":
    "Reintenta en unos minutos; si persiste, ejecuta `claude login`.",
  "health.db.ok": "La base de datos es escribible.",
  "health.db.remedy":
    "Revisa los permisos de ~/.amnis. Si el fichero está corrupto, bórralo y reinicia (se pierden la serie de cuota y los eventos de hook).",
  "health.ingest.firstRun": "La primera ingesta tras arrancar está en curso.",
  "health.ingest.autoFailed": "La última ingesta automática falló: {{detail}}",
  "health.ingest.autoFailedRemedy":
    "Ejecuta `amnis ingest` para ver el error completo; mientras tanto la estimación local queda atrasada.",
  "health.ingest.autoStale":
    "Hace más de {{minutes}} min que no se completa una ingesta automática.",
  "health.ingest.autoStaleRemedy":
    "Reinicia el daemon; si persiste, ejecuta `amnis ingest`.",
  "health.ingest.autoOk": "La ingesta automática está al día.",
  "health.ingest.never": "Nunca se ha ingerido nada.",
  "health.ingest.run": "Ejecuta `amnis ingest`.",
  "health.ingest.recent": "La última ingesta es reciente.",
  "health.ingest.stale": "La última ingesta fue hace más de {{hours}}h.",
  "health.spotify.notConfigured":
    "No configurado (opcional). Redirect URI a registrar: {{uri}}",
  "health.spotify.notLoggedIn": "Hay Client ID pero no has hecho login.",
  "health.spotify.loginRemedy":
    "Ejecuta `amnis spotify login`. El redirect URI de tu app debe ser exactamente {{uri}}",
  "health.spotify.ok": "Sesión de Spotify activa. Redirect URI: {{uri}}",

  "credentials.noSession":
    "No se encontró una sesión de Claude Code. Ejecuta `claude login` e inténtalo de nuevo.",
  "credentials.invalidJson":
    "El fichero de credenciales no es JSON válido ({{source}}).",
  "credentials.unexpectedShape":
    "El fichero de credenciales no tiene la forma esperada (claudeAiOauth.accessToken, {{source}}).",
  "credentials.unreadable": "No se pudo leer {{path}}: {{detail}}.",
  "credentials.expired":
    "El token de Claude Code caducó: se renueva solo en cuanto vuelvas a usar Claude Code. Mientras, el % es una estimación local.",

  "quota.network": "Fallo de red al consultar la cuota: {{detail}}.",
  "quota.status": "El endpoint de cuota respondió {{status}}.",
  "quota.invalidJson": "Respuesta de cuota no es JSON válido.",
  "quota.unexpectedShape": "Respuesta de cuota con forma inesperada.",

  "spotify.missingClientId": "Falta el Client ID de Spotify.",
  "spotify.clientIdRemedy": "amnis spotify login --client-id <tu id>",
  "spotify.notLoggedIn": "Sin sesión de Spotify.",
  "spotify.loginRemedy": "Conecta Spotify con `amnis spotify login`.",
  "spotify.sessionInvalid": "La sesión de Spotify ya no es válida: {{reason}}",
  "spotify.sessionExpired": "La sesión de Spotify ya no es válida.",
  "spotify.network": "Fallo de red al hablar con Spotify: {{detail}}.",
  "spotify.statusNoJson": "Spotify respondió {{status}} sin JSON válido.",
  "spotify.rejected": "Spotify rechazó la petición ({{status}}): {{detail}}.",
  "spotify.unexpectedShape": "Respuesta de Spotify con forma inesperada.",
  "spotify.noDevice": "Abre Spotify en algún dispositivo.",
  "spotify.premiumRequired": "Esta acción requiere Spotify Premium.",
  "spotify.forbidden": "Spotify no permite esta acción ahora.",
  "spotify.forbiddenDetail": "Spotify no permite esta acción ahora: {{detail}}",
  "spotify.rateLimited": "Spotify pide esperar antes de volver a intentarlo.",
  "spotify.status": "Spotify respondió {{status}}.",
  "spotify.unreachable": "No se pudo contactar con Spotify.",
  "spotify.unexpectedError": "Error inesperado hablando con Spotify.",
  "spotify.invalidResponse": "Respuesta de Spotify no válida.",
  "spotify.page.expired":
    "El login caducó o el daemon se reinició. Vuelve a pulsar Conectar.",
  "spotify.page.cancelled": "Cancelaste el login de Spotify.",
  "spotify.page.incomplete":
    "Respuesta de Spotify incompleta. Vuelve a pulsar Conectar.",
  "spotify.page.connected": "Spotify conectado. Ya puedes cerrar esta pestaña.",

  "body.notObject": "El body debe ser un objeto.",
  "body.tooLarge": "El body es demasiado grande.",
  "body.invalidJson": "El body no es JSON válido.",
  "body.invalid": "Body inválido: {{expected}}.",
  "validation.unknownField": "Campo desconocido: {{field}}.",
  "validation.field": "{{field}} debe ser {{expected}}.",
  "validation.boolean": "true o false",
  "validation.version": "null o una versión X.Y.Z",
  "validation.range": "un número entre {{min}} y {{max}}",
  "validation.oneOf": "uno de: {{values}}",
  "settings.invalidPlan": "plan debe ser null o uno de: {{allowed}}.",
  "settings.invalidPetFocus":
    'petFocus debe ser {"kind":"auto"}, {"kind":"repo","repoRoot"}, {"kind":"worktree","worktree"} o {"kind":"session","sessionId","worktree"}, con textos no vacíos.',
  "settings.invalidTheme": "theme debe ser uno de: {{allowed}}.",
  "settings.invalidLocale": "locale debe ser uno de: {{allowed}}.",
  "settings.invalidPetScale": "petScale debe ser uno de: {{allowed}}.",
  "settings.invalidPetSkin":
    "petSkin debe ser null o el nombre de una carpeta de skin (letras, números, «.», «_» y «-»).",

  "http.internal": "Error interno.",
  "http.hostNotAllowed": "Origen no permitido: Host no permitido ({{host}}).",
  "http.originNotAllowed":
    "Origen no permitido: Origin no permitido ({{origin}}).",
  "http.methodNotAllowed": "Método no permitido.",
  "http.notFound": "No encontrado.",
  "http.invalidDay": "day debe ser una fecha YYYY-MM-DD válida.",
  "http.invalidWeeks": "weeks debe ser un entero entre 1 y {{max}}.",
  "http.invalidRange": "from/to deben ser fechas ISO 8601 válidas.",
  "http.invalidGroupBy":
    'groupBy inválido: "{{value}}". Debe ser day, project, model o day,model.',

  "ingest.rebuildRunning": "Ya hay una reconstrucción en curso.",
  "ingest.rebuildFailed": "La reconstrucción falló: {{detail}}",
} as const;

export type MessageKey = keyof typeof DAEMON_MESSAGES_ES;

/** Mismas claves que en español: una que falte rompe `tsc`. */
export const DAEMON_MESSAGES_EN: Record<MessageKey, string> = {
  raw: "{{text}}",

  "health.daemon.ok": "The daemon is responding.",
  "health.daemon.down": "The daemon isn't responding.",
  "health.daemon.remedy": "Start it with `amnis serve`.",
  "health.hooks.ok": "Amnis hooks are installed.",
  "health.hooks.missing": "Missing Amnis hooks: {{events}}.",
  "health.hooks.remedy":
    "Install or repair them with `amnis install-hooks` or the “Repair hooks” button in Settings.",
  "health.credentials.ok": "The credentials are readable.",
  "health.claudeLogin": "Run `claude login`.",
  "health.token.unchecked": "Couldn't check: no readable credentials.",
  "health.token.expired":
    "Expired: Claude Code renews it as soon as you use it again. Meanwhile, the % is a local estimate.",
  "health.token.ok": "The token is valid.",
  "health.endpoint.waiting": "Not queried until Claude Code renews the token.",
  "health.endpoint.ok": "The quota endpoint is responding.",
  "health.endpoint.remedy":
    "Try again in a few minutes; if it persists, run `claude login`.",
  "health.db.ok": "The database is writable.",
  "health.db.remedy":
    "Check the permissions of ~/.amnis. If the file is corrupt, delete it and restart (the quota series and hook events are lost).",
  "health.ingest.firstRun": "The first ingest since startup is in progress.",
  "health.ingest.autoFailed": "The last automatic ingest failed: {{detail}}",
  "health.ingest.autoFailedRemedy":
    "Run `amnis ingest` to see the full error; meanwhile the local estimate falls behind.",
  "health.ingest.autoStale":
    "No automatic ingest has completed in over {{minutes}} min.",
  "health.ingest.autoStaleRemedy":
    "Restart the daemon; if it persists, run `amnis ingest`.",
  "health.ingest.autoOk": "Automatic ingest is up to date.",
  "health.ingest.never": "Nothing has ever been ingested.",
  "health.ingest.run": "Run `amnis ingest`.",
  "health.ingest.recent": "The last ingest is recent.",
  "health.ingest.stale": "The last ingest was more than {{hours}}h ago.",
  "health.spotify.notConfigured":
    "Not set up (optional). Redirect URI to register: {{uri}}",
  "health.spotify.notLoggedIn":
    "There's a Client ID but you haven't logged in.",
  "health.spotify.loginRemedy":
    "Run `amnis spotify login`. Your app's redirect URI must be exactly {{uri}}",
  "health.spotify.ok": "Spotify session active. Redirect URI: {{uri}}",

  "credentials.noSession":
    "No Claude Code session found. Run `claude login` and try again.",
  "credentials.invalidJson":
    "The credentials file isn't valid JSON ({{source}}).",
  "credentials.unexpectedShape":
    "The credentials file doesn't have the expected shape (claudeAiOauth.accessToken, {{source}}).",
  "credentials.unreadable": "Couldn't read {{path}}: {{detail}}.",
  "credentials.expired":
    "The Claude Code token expired: it renews itself as soon as you use Claude Code again. Meanwhile, the % is a local estimate.",

  "quota.network": "Network error while querying the quota: {{detail}}.",
  "quota.status": "The quota endpoint responded {{status}}.",
  "quota.invalidJson": "The quota response isn't valid JSON.",
  "quota.unexpectedShape": "The quota response has an unexpected shape.",

  "spotify.missingClientId": "The Spotify Client ID is missing.",
  "spotify.clientIdRemedy": "amnis spotify login --client-id <your id>",
  "spotify.notLoggedIn": "No Spotify session.",
  "spotify.loginRemedy": "Connect Spotify with `amnis spotify login`.",
  "spotify.sessionInvalid":
    "The Spotify session is no longer valid: {{reason}}",
  "spotify.sessionExpired": "The Spotify session is no longer valid.",
  "spotify.network": "Network error while talking to Spotify: {{detail}}.",
  "spotify.statusNoJson": "Spotify responded {{status}} without valid JSON.",
  "spotify.rejected": "Spotify rejected the request ({{status}}): {{detail}}.",
  "spotify.unexpectedShape": "Spotify's response has an unexpected shape.",
  "spotify.noDevice": "Open Spotify on any device.",
  "spotify.premiumRequired": "This action requires Spotify Premium.",
  "spotify.forbidden": "Spotify doesn't allow this action right now.",
  "spotify.forbiddenDetail":
    "Spotify doesn't allow this action right now: {{detail}}",
  "spotify.rateLimited": "Spotify asks to wait before trying again.",
  "spotify.status": "Spotify responded {{status}}.",
  "spotify.unreachable": "Couldn't reach Spotify.",
  "spotify.unexpectedError": "Unexpected error talking to Spotify.",
  "spotify.invalidResponse": "Invalid response from Spotify.",
  "spotify.page.expired":
    "The login expired or the daemon restarted. Press Connect again.",
  "spotify.page.cancelled": "You cancelled the Spotify login.",
  "spotify.page.incomplete":
    "Incomplete response from Spotify. Press Connect again.",
  "spotify.page.connected": "Spotify connected. You can close this tab now.",

  "body.notObject": "The body must be an object.",
  "body.tooLarge": "The body is too large.",
  "body.invalidJson": "The body isn't valid JSON.",
  "body.invalid": "Invalid body: {{expected}}.",
  "validation.unknownField": "Unknown field: {{field}}.",
  "validation.field": "{{field}} must be {{expected}}.",
  "validation.boolean": "true or false",
  "validation.version": "null or an X.Y.Z version",
  "validation.range": "a number between {{min}} and {{max}}",
  "validation.oneOf": "one of: {{values}}",
  "settings.invalidPlan": "plan must be null or one of: {{allowed}}.",
  "settings.invalidPetFocus":
    'petFocus must be {"kind":"auto"}, {"kind":"repo","repoRoot"}, {"kind":"worktree","worktree"} or {"kind":"session","sessionId","worktree"}, with non-empty strings.',
  "settings.invalidTheme": "theme must be one of: {{allowed}}.",
  "settings.invalidLocale": "locale must be one of: {{allowed}}.",
  "settings.invalidPetScale": "petScale must be one of: {{allowed}}.",
  "settings.invalidPetSkin":
    "petSkin must be null or the name of a skin folder (letters, digits, '.', '_' and '-').",

  "http.internal": "Internal error.",
  "http.hostNotAllowed": "Origin not allowed: Host not allowed ({{host}}).",
  "http.originNotAllowed":
    "Origin not allowed: Origin not allowed ({{origin}}).",
  "http.methodNotAllowed": "Method not allowed.",
  "http.notFound": "Not found.",
  "http.invalidDay": "day must be a valid YYYY-MM-DD date.",
  "http.invalidWeeks": "weeks must be an integer between 1 and {{max}}.",
  "http.invalidRange": "from/to must be valid ISO 8601 dates.",
  "http.invalidGroupBy":
    'Invalid groupBy: "{{value}}". It must be day, project, model or day,model.',

  "ingest.rebuildRunning": "A rebuild is already in progress.",
  "ingest.rebuildFailed": "The rebuild failed: {{detail}}",
};

export type MessageLanguage = "es" | "en";

/** Un parámetro puede ser otro mensaje: se formatea en el mismo idioma. */
export type MessageParam = string | number | DaemonMessage;

export interface DaemonMessage {
  key: MessageKey;
  params?: Record<string, MessageParam>;
}

export function msg(
  key: MessageKey,
  params?: Record<string, MessageParam>,
): DaemonMessage {
  return params === undefined ? { key } : { key, params };
}

const CATALOG: Record<MessageLanguage, Record<string, string>> = {
  es: DAEMON_MESSAGES_ES,
  en: DAEMON_MESSAGES_EN,
};

/**
 * Texto de un mensaje del daemon. Una clave desconocida (daemon más nuevo
 * que el cliente) sale tal cual: mejor la clave que nada.
 */
export function formatMessage(
  language: MessageLanguage,
  message: DaemonMessage,
): string {
  const template = CATALOG[language][message.key] ?? message.key;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = message.params?.[name];
    if (value === undefined) return match;
    return typeof value === "object"
      ? formatMessage(language, value)
      : String(value);
  });
}

export function isDaemonMessage(v: unknown): v is DaemonMessage {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { key?: unknown }).key === "string"
  );
}

/** Cuerpo de cualquier respuesta de error del daemon. */
export interface ApiError {
  error: DaemonMessage;
  /** Campo que falla en una validación. */
  field?: string;
  /** Tipo de fallo del control de Spotify. */
  kind?: string;
  remedy?: DaemonMessage;
}
