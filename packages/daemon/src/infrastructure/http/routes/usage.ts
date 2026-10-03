import type { DatabaseSync } from "node:sqlite";
import { currentPrices } from "../../persistence/prices.ts";
import { aggregate, type UsageGroupBy } from "../../persistence/usage.ts";
import type { RouteHandler } from "../server.ts";

const VALID_GROUP_BY: readonly UsageGroupBy[] = [
  "day",
  "project",
  "model",
  "day,model",
];

function isValidGroupBy(value: string): value is UsageGroupBy {
  return (VALID_GROUP_BY as readonly string[]).includes(value);
}

function sendJson(
  res: Parameters<RouteHandler>[0]["res"],
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * GET /api/usage?groupBy=day|project|model|day,model&from=&to=
 *
 * Los rollups se calculan en cada consulta desde usage_events, nunca desde
 * una tabla mantenida a parte: aggregate() en persistence/usage.ts.
 */
export function createUsageRoute(
  db: DatabaseSync,
  accountId: number,
): RouteHandler {
  return ({ res, url }) => {
    const groupByParam = url.searchParams.get("groupBy") ?? "day";
    if (!isValidGroupBy(groupByParam)) {
      sendJson(res, 400, {
        error: `groupBy inválido: "${groupByParam}". Debe ser day, project, model o day,model.`,
      });
      return;
    }

    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const from = fromParam ? new Date(fromParam) : undefined;
    const to = toParam ? new Date(toParam) : undefined;

    if (
      (fromParam && Number.isNaN(from?.getTime())) ||
      (toParam && Number.isNaN(to?.getTime()))
    ) {
      sendJson(res, 400, {
        error: "from/to deben ser fechas ISO 8601 válidas.",
      });
      return;
    }

    const { prices, updatedAt } = currentPrices(db);
    const { rows, unpricedModels } = aggregate(
      db,
      accountId,
      { groupBy: groupByParam, from, to },
      prices,
    );
    sendJson(res, 200, {
      groupBy: groupByParam,
      pricesUpdatedAt: updatedAt,
      unpricedModels,
      rows,
    });
  };
}
