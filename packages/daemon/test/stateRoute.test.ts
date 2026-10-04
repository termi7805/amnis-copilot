import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, type StateResponse } from "@amnis/shared";
import type { GetStateDeps } from "../src/application/getState.ts";
import { createStateRoute } from "../src/infrastructure/http/routes/state.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";
import { emptyMedia } from "../src/infrastructure/providers/spotify/player.ts";

function makeDeps(): GetStateDeps {
  return {
    version: "0.0.1",
    startedAt: "2026-01-01T00:00:00.000Z",
    focus: () => ({ kind: "auto" }),
    lastKnownStateEvent: () => null,
    liveSessionCandidates: () => [],
    countHookEvents: () => 0,
    countUsageEvents: () => 0,
    readCommitHash: () => null,
    listening: () => null,
    settings: () => DEFAULT_SETTINGS,
    plan: () => null,
    media: () =>
      Promise.resolve(emptyMedia("not-configured", "2026-01-01T00:00:00.000Z")),
    sampleQuotas: () =>
      Promise.resolve([
        {
          provider: "anthropic",
          authoritative: null,
          local: {
            fiveHourTokens: 0,
            fiveHourUtilization: 0,
            windowStartedAt: "2026-01-01T00:00:00.000Z",
            calibrated: true,
            ceilingWindows: 3,
            provisionalUtilization: null,
          },
          divergence: null,
          projection: { fiveHourAtReset: null },
          sampledAt: "2026-01-01T00:00:00.000Z",
          error: null,
        },
      ]),
  };
}

test("GET /api/state responde 200 con la forma de StateResponse", async () => {
  const server = createHttpServer({
    routes: { "GET /api/state": createStateRoute(makeDeps()) },
  });
  const port = await server.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/state`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/json");

    const body = (await response.json()) as StateResponse;
    assert.equal(body.pet.state, "sleeping");
    assert.equal(body.quotas.length, 1);
    assert.equal(body.quotas[0]?.provider, "anthropic");
    assert.equal(body.daemon.version, "0.0.1");
  } finally {
    await server.close();
  }
});
