import type { DatabaseSync } from "node:sqlite";
import type { QuotaHistoryResponse, QuotaPeak } from "@amnis/shared";
import { dailyPeaks, samplesBetween } from "../../persistence/quotaSamples.ts";
import type { RouteHandler } from "../server.ts";

const DAY_MS = 24 * 60 * 60_000;

function sendJson(
  res: Parameters<RouteHandler>[0]["res"],
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * `from`/`to` de la query, con la ventana por defecto si faltan. `null` si
 * alguna no es una fecha ISO 8601 válida (el handler responde 400).
 */
function parseRange(
  url: URL,
  defaultSpanMs: number,
): { from: Date; to: Date } | null {
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam
    ? new Date(fromParam)
    : new Date(to.getTime() - defaultSpanMs);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { from, to };
}

const INVALID_RANGE = {
  error: "from/to deben ser fechas ISO 8601 válidas.",
};

/**
 * GET /api/quota/history?from&to — la serie de `quota_samples` (24 h por
 * defecto): de ahí salen la sparkline de la ventana actual y, con
 * `/api/quota/peaks`, el pico diario de Histórico.
 */
export function createQuotaHistoryRoutes(
  db: DatabaseSync,
  accountId: number,
): Record<string, RouteHandler> {
  return {
    "GET /api/quota/history": ({ res, url }) => {
      const range = parseRange(url, DAY_MS);
      if (!range) return sendJson(res, 400, INVALID_RANGE);
      const body: QuotaHistoryResponse = {
        samples: samplesBetween(db, accountId, range.from, range.to).map(
          (r) => ({
            at: r.ts,
            fiveHour: r.fiveHourUtil,
            sevenDay: r.sevenDayUtil,
            local: r.localUtil,
          }),
        ),
      };
      sendJson(res, 200, body);
    },

    // 7 días por defecto.
    "GET /api/quota/peaks": ({ res, url }) => {
      const range = parseRange(url, 7 * DAY_MS);
      if (!range) return sendJson(res, 400, INVALID_RANGE);
      const body: QuotaPeak[] = dailyPeaks(db, accountId, range.from, range.to);
      sendJson(res, 200, body);
    },
  };
}
