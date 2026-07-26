import type { QuotaWindow } from "@amnis/shared";
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

/**
 * Pura: castea la forma documentada en DESIGN.md §2. `null` si no encaja
 * — degradar, nunca lanzar, porque el endpoint no está soportado.
 *
 * `seven_day_sonnet` y `extra_usage` vienen en la respuesta pero
 * QuotaReading.authoritative (fijado en #44) no tiene sitio para ellos
 * todavía: se leen y se ignoran hasta que haya un consumidor real.
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
    sevenDayOpus: parseWindow(body.seven_day_opus),
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
