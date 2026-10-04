import type { DatabaseSync } from "node:sqlite";
import { msg } from "@amnis/shared";
import {
  type ActivityDeps,
  formatDay,
  getActivity,
  getHeatmap,
  parseDay,
  startOfDay,
} from "../../../application/getActivity.ts";
import { eventsBetween } from "../../persistence/hookEvents.ts";
import { currentPrices } from "../../persistence/prices.ts";
import { aggregate, branchesBySession } from "../../persistence/usage.ts";
import type { RouteHandler } from "../server.ts";

const MAX_WEEKS = 52;

function sendJson(
  res: Parameters<RouteHandler>[0]["res"],
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function makeActivityDeps(
  db: DatabaseSync,
  accountId: number,
): ActivityDeps {
  return {
    eventsBetween: (from, to) => eventsBetween(db, accountId, from, to),
    usageBySession: (from, to) => {
      const { prices } = currentPrices(db);
      // `aggregate` incluye `to`; el día es [from, to).
      const { rows } = aggregate(
        db,
        accountId,
        {
          groupBy: "session",
          from,
          to: new Date(to.getTime() - 1),
        },
        prices,
      );
      return new Map(
        rows.map((r) => [
          r.key,
          {
            tokens:
              r.inputTokens +
              r.outputTokens +
              r.cacheCreationTokens +
              r.cacheReadTokens,
            costUsd: r.costUsd,
          },
        ]),
      );
    },
    branchBySession: (from, to) => branchesBySession(db, accountId, from, to),
  };
}

/**
 * GET /api/activity?day=YYYY-MM-DD — qué hicieron los agentes ese día (hoy
 * por defecto), con el día en hora local del daemon, no en UTC como el uso:
 * "ayer" y las horas del mapa de calor son las de quien mira.
 *
 * GET /api/activity/heatmap?weeks=4 — matriz 7×24 de minutos de agente.
 */
export function createActivityRoutes(
  db: DatabaseSync,
  accountId: number,
): Record<string, RouteHandler> {
  const deps = makeActivityDeps(db, accountId);
  return {
    "GET /api/activity": ({ res, url }) => {
      const now = new Date();
      const dayParam = url.searchParams.get("day") ?? formatDay(now);
      const dayStart = parseDay(dayParam) ?? null;
      if (!dayStart) {
        return sendJson(res, 400, {
          error: msg("http.invalidDay"),
        });
      }
      sendJson(res, 200, getActivity(deps, startOfDay(dayStart), now));
    },

    "GET /api/activity/heatmap": ({ res, url }) => {
      const weeksParam = url.searchParams.get("weeks") ?? "4";
      const weeks = Number(weeksParam);
      if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_WEEKS) {
        return sendJson(res, 400, {
          error: msg("http.invalidWeeks", { max: MAX_WEEKS }),
        });
      }
      sendJson(res, 200, getHeatmap(deps, weeks, new Date()));
    },
  };
}
