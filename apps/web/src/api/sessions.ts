import type { SessionsResponse } from "@amnis/shared";
import { daemonUrl } from "./config.ts";

/** Repos, worktrees y sesiones vistos por hooks en las últimas 24 h (#107). */
export async function fetchSessions(): Promise<SessionsResponse> {
  const response = await fetch(`${daemonUrl()}/api/sessions`);
  if (!response.ok) {
    throw new Error(`GET /api/sessions → ${response.status}`);
  }
  return response.json();
}
