import {
  msg,
  type QuotaLimit,
  type QuotaWindow,
  type WeeklyBreakdown,
} from "@amnis/shared";
import type { QuotaReading } from "../../../domain/Provider.ts";

const QUOTA_URL = "https://api.anthropic.com/api/oauth/usage";
const ANTHROPIC_BETA = "oauth-2025-04-20";
const DEFAULT_USER_AGENT =
  process.env.AMNIS_ANTHROPIC_USER_AGENT ?? "claude-code/2.1.220";
const DEFAULT_TIMEOUT_MS = 10_000;

function parseWindow(raw: unknown): QuotaWindow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const w = raw as Record<string, unknown>;
  if (typeof w.utilization !== "number") return null;
  return {
    utilization: w.utilization,
    resetsAt: typeof w.resets_at === "string" ? w.resets_at : null,
  };
}

/** Etiquetas de los `kind` vistos en la respuesta real (octubre de 2026). */
const KNOWN_KIND_LABELS: Record<string, string> = {
  session: "5h",
  weekly_all: "7d",
};

/**
 * Lo mismo por `group`: un `kind` nuevo de un grupo conocido (p. ej.
 * `weekly_scoped`) se etiqueta por su ventana en vez de por su nombre en crudo.
 */
const KNOWN_GROUP_LABELS: Record<string, string> = {
  session: "5h",
  weekly: "7d",
};

/**
 * Etiqueta genérica: nunca depende de conocer el `kind` ni el `scope`. Lo
 * desconocido se muestra tal cual en vez de descartarse.
 */
export function limitLabel(
  kind: string,
  group: string,
  scope: string | null,
): string {
  const base = KNOWN_KIND_LABELS[kind] ?? KNOWN_GROUP_LABELS[group] ?? kind;
  return scope ? `${base} · ${scope}` : base;
}

/** `display_name` o, en su defecto, `id` de una parte del `scope`. */
function partName(raw: unknown): string | null {
  if (typeof raw === "string") return raw || null;
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.display_name === "string" && p.display_name) {
    return p.display_name;
  }
  return typeof p.id === "string" && p.id ? p.id : null;
}

/**
 * Nombre legible del `scope`. La API lo mandaba como texto (`"fable"`) y ahora
 * como objeto (`{ model: { display_name: "Fable" }, surface: null }`); se
 * aceptan las dos. `surface` va detrás del modelo si algún día llega rellena,
 * en vez de descartarse.
 */
function scopeName(raw: unknown): string | null {
  if (typeof raw === "string") return raw || null;
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Record<string, unknown>;
  const parts = [partName(s.model), partName(s.surface)].filter(
    (p): p is string => p !== null,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

function parseLimitEntry(raw: unknown): QuotaLimit | null {
  if (typeof raw !== "object" || raw === null) return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.percent !== "number") return null;
  const kind = typeof l.kind === "string" ? l.kind : "unknown";
  const group = typeof l.group === "string" ? l.group : kind;
  const scope = scopeName(l.scope);
  return {
    kind,
    group,
    scope,
    utilization: l.percent,
    resetsAt: typeof l.resets_at === "string" ? l.resets_at : null,
    severity: typeof l.severity === "string" ? l.severity : "normal",
    isActive: l.is_active === true,
    label: limitLabel(kind, group, scope),
  };
}

/**
 * La lista de límites de *esta* cuenta. Con `limits[]` en la respuesta se usa
 * tal cual; si no viene, se reconstruye de `five_hour`, `seven_day` y de
 * cualquier `seven_day_<x>` con ventana válida. Las claves con nombre en
 * clave (`iguana_necktie`, `tangelo`…) son internas de Anthropic y se ignoran.
 */
export function parseLimits(body: Record<string, unknown>): QuotaLimit[] {
  if (Array.isArray(body.limits)) {
    return body.limits
      .map(parseLimitEntry)
      .filter((l): l is QuotaLimit => l !== null);
  }

  const limits: QuotaLimit[] = [];
  const push = (
    kind: string,
    group: string,
    scope: string | null,
    w: QuotaWindow,
  ) =>
    limits.push({
      kind,
      group,
      scope,
      utilization: w.utilization,
      resetsAt: w.resetsAt,
      severity: "normal",
      isActive: true,
      label: limitLabel(kind, group, scope),
    });

  const fiveHour = parseWindow(body.five_hour);
  if (fiveHour) push("session", "session", null, fiveHour);
  const sevenDay = parseWindow(body.seven_day);
  if (sevenDay) push("weekly_all", "weekly", null, sevenDay);
  for (const [key, value] of Object.entries(body)) {
    if (!key.startsWith("seven_day_")) continue;
    const w = parseWindow(value);
    if (w) {
      const scope = key.slice("seven_day_".length);
      push(key, "weekly", scope, w);
    }
  }
  return limits;
}

/**
 * Reparto del consumo de 7 d por origen. Tolerante: un `key` desconocido se
 * conserva con su `display_name`; lo que no encaja degrada a `null` sin
 * invalidar el resto de la respuesta.
 */
export function parseWeeklyBreakdown(raw: unknown): WeeklyBreakdown | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.rows)) return null;

  const rows: WeeklyBreakdown["rows"] = [];
  for (const row of b.rows) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    if (typeof r.key !== "string" || typeof r.percent !== "number") continue;
    rows.push({
      key: r.key,
      label: typeof r.display_name === "string" ? r.display_name : r.key,
      percent: r.percent,
    });
  }
  return {
    asOf: typeof b.as_of === "string" ? b.as_of : null,
    windowStartedAt:
      typeof b.window_started_at === "string" ? b.window_started_at : null,
    rows,
  };
}

/**
 * Pura: castea la forma documentada en DESIGN.md §2. `null` si no encaja
 * — degradar, nunca lanzar, porque el endpoint no está soportado.
 *
 * `extra_usage`, `spend` y las claves con nombre en clave se ignoran hasta
 * que haya un consumidor real.
 */
export function parseQuotaResponse(
  raw: unknown,
): QuotaReading["authoritative"] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;

  const fiveHour = parseWindow(body.five_hour);
  const sevenDay = parseWindow(body.seven_day);
  if (!fiveHour || !sevenDay) return null;

  return {
    fiveHour,
    sevenDay,
    limits: parseLimits(body),
    weeklyBreakdown: parseWeeklyBreakdown(body.seven_day_breakdown),
  };
}

export interface FetchQuotaOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
}

/**
 * GET al endpoint de cuota. Nunca lanza: cualquier fallo (red, timeout,
 * no-2xx, JSON con otra forma) es `{authoritative: null, error}`, porque
 * el endpoint no está documentado ni soportado y puede cambiar sin aviso.
 */
export async function fetchQuota(
  accessToken: string,
  opts: FetchQuotaOptions = {},
): Promise<QuotaReading> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;

  let response: Response;
  try {
    response = await fetchImpl(QUOTA_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": ANTHROPIC_BETA,
        "User-Agent": userAgent,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return {
      authoritative: null,
      error: msg("quota.network", { detail: (err as Error).message }),
      rateLimited: false,
    };
  }

  if (!response.ok) {
    return {
      authoritative: null,
      error: msg("quota.status", { status: response.status }),
      rateLimited: response.status === 429,
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      authoritative: null,
      error: msg("quota.invalidJson"),
      rateLimited: false,
    };
  }

  const authoritative = parseQuotaResponse(data);
  if (!authoritative) {
    return {
      authoritative: null,
      error: msg("quota.unexpectedShape"),
      rateLimited: false,
    };
  }

  return { authoritative, error: null, rateLimited: false };
}
