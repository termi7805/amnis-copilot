import type { QuotaLimit, QuotaWindow } from "@amnis/shared";
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
 * Etiqueta genérica: nunca depende de conocer el `kind` ni el `scope`. Lo
 * desconocido se muestra tal cual en vez de descartarse.
 */
export function limitLabel(kind: string, scope: string | null): string {
  const base = KNOWN_KIND_LABELS[kind] ?? kind;
  return scope ? `${base} · ${scope}` : base;
}

function parseLimitEntry(raw: unknown): QuotaLimit | null {
  if (typeof raw !== "object" || raw === null) return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.percent !== "number") return null;
  const kind = typeof l.kind === "string" ? l.kind : "unknown";
  const scope = typeof l.scope === "string" ? l.scope : null;
  return {
    kind,
    group: typeof l.group === "string" ? l.group : kind,
    scope,
    utilization: l.percent,
    resetsAt: typeof l.resets_at === "string" ? l.resets_at : null,
    severity: typeof l.severity === "string" ? l.severity : "normal",
    isActive: l.is_active === true,
    label: limitLabel(kind, scope),
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
    labelKind = kind,
  ) =>
    limits.push({
      kind,
      group,
      scope,
      utilization: w.utilization,
      resetsAt: w.resetsAt,
      severity: "normal",
      isActive: true,
      label: limitLabel(labelKind, scope),
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
      push(key, "weekly", scope, w, "weekly_all");
    }
  }
  return limits;
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

  return { fiveHour, sevenDay, limits: parseLimits(body) };
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
      error: `Fallo de red al consultar la cuota: ${(err as Error).message}.`,
    };
  }

  if (!response.ok) {
    return {
      authoritative: null,
      error: `El endpoint de cuota respondió ${response.status}.`,
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      authoritative: null,
      error: "Respuesta de cuota no es JSON válido.",
    };
  }

  const authoritative = parseQuotaResponse(data);
  if (!authoritative) {
    return {
      authoritative: null,
      error: "Respuesta de cuota con forma inesperada.",
    };
  }

  return { authoritative, error: null };
}
