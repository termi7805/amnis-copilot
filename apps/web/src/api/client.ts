import type { StateResponse } from "@amnis/shared";
import { daemonUrl } from "./config.ts";

export async function fetchState(): Promise<StateResponse> {
  const response = await fetch(`${daemonUrl()}/api/state`);
  if (!response.ok) {
    throw new Error(`GET /api/state → ${response.status}`);
  }
  return response.json();
}
