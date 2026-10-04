import type { DatabaseSync } from "node:sqlite";
import {
  type ListSessionsDeps,
  listSessions,
} from "../../../application/listSessions.ts";
import { recentSessions } from "../../persistence/hookEvents.ts";
import { branchesBySession } from "../../persistence/usage.ts";
import type { RouteHandler } from "../server.ts";

export function makeSessionsDeps(
  db: DatabaseSync,
  accountId: number,
): ListSessionsDeps {
  return {
    recentSessions: (since) => recentSessions(db, accountId, since),
    branchBySession: (from, to) => branchesBySession(db, accountId, from, to),
  };
}

/** GET /api/sessions — repos, worktrees y sesiones vistos por hooks (#107). */
export function createSessionsRoutes(
  db: DatabaseSync,
  accountId: number,
): Record<string, RouteHandler> {
  const deps = makeSessionsDeps(db, accountId);
  return {
    "GET /api/sessions": ({ res }) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(listSessions(deps, new Date())));
    },
  };
}
