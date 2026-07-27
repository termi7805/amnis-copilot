import assert from "node:assert/strict";
import { test } from "node:test";
import type { QuotaSnapshot } from "@amnis/shared";
import {
  type GetStateDeps,
  getState,
  type LastKnownStateEvent,
} from "../src/application/getState.ts";

const STARTED_AT = "2026-01-01T00:00:00.000Z";
const NOW = new Date("2026-01-01T01:00:00.000Z");

function makeQuota(overrides: Partial<QuotaSnapshot> = {}): QuotaSnapshot {
  return {
    provider: "anthropic",
    authoritative: null,
    local: {
      fiveHourTokens: 0,
      fiveHourUtilization: 0,
      windowStartedAt: STARTED_AT,
    },
    divergence: null,
    sampledAt: NOW.toISOString(),
    error: null,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<GetStateDeps> = {}): GetStateDeps {
  return {
    version: "0.0.1",
    startedAt: STARTED_AT,
    lastKnownStateEvent: () => null,
    countHookEvents: () => 0,
    countUsageEvents: () => 0,
    sampleQuotas: () => Promise.resolve([makeQuota()]),
    ...overrides,
  };
}

test("sin eventos nunca: sleeping, since = startedAt", async () => {
  const state = await getState(makeDeps(), NOW);

  assert.equal(state.pet.state, "sleeping");
  assert.equal(state.pet.since, STARTED_AT);
});

test("evento reciente: el estado y el reason reflejan el último evento con estado conocido", async () => {
  const event: LastKnownStateEvent = {
    hook: "PreToolUse",
    toolName: "Edit",
    derivedState: "coding",
    ts: new Date(NOW.getTime() - 1000).toISOString(),
  };
  const state = await getState(
    makeDeps({ lastKnownStateEvent: () => event }),
    NOW,
  );

  assert.equal(state.pet.state, "coding");
  assert.equal(state.pet.since, event.ts);
  assert.ok(state.pet.reason.includes("Edit"));
});

test("evento antiguo (> 10 min): sleeping, since = ts del último evento", async () => {
  const event: LastKnownStateEvent = {
    hook: "PreToolUse",
    toolName: "Edit",
    derivedState: "coding",
    ts: new Date(NOW.getTime() - 15 * 60_000).toISOString(),
  };
  const state = await getState(
    makeDeps({ lastKnownStateEvent: () => event }),
    NOW,
  );

  assert.equal(state.pet.state, "sleeping");
  assert.equal(state.pet.since, event.ts);
});

test("eventsReceived y usageEvents reflejan lo que devuelven las deps", async () => {
  const state = await getState(
    makeDeps({ countHookEvents: () => 42, countUsageEvents: () => 7 }),
    NOW,
  );

  assert.equal(state.daemon.eventsReceived, 42);
  assert.equal(state.daemon.usageEvents, 7);
  assert.equal(state.daemon.startedAt, STARTED_AT);
});

test("quotas conserva el provider de cada entrada", async () => {
  const state = await getState(
    makeDeps({
      sampleQuotas: () =>
        Promise.resolve([makeQuota({ provider: "anthropic" })]),
    }),
    NOW,
  );

  assert.equal(state.quotas.length, 1);
  assert.equal(state.quotas[0]?.provider, "anthropic");
});

test("fatiga se clampea a [0,1] aunque la utilización venga por encima de 100", async () => {
  const state = await getState(
    makeDeps({
      sampleQuotas: () =>
        Promise.resolve([
          makeQuota({
            authoritative: {
              fiveHour: { utilization: 150, resetsAt: null },
              sevenDay: { utilization: 10, resetsAt: null },
              sevenDayOpus: null,
            },
          }),
        ]),
    }),
    NOW,
  );

  assert.equal(state.pet.fatigue, 1);
});

test("fatiga usa la vía local cuando no hay autoritativa", async () => {
  const state = await getState(
    makeDeps({
      sampleQuotas: () =>
        Promise.resolve([
          makeQuota({
            local: {
              fiveHourTokens: 1000,
              fiveHourUtilization: 40,
              windowStartedAt: STARTED_AT,
            },
          }),
        ]),
    }),
    NOW,
  );

  assert.equal(state.pet.fatigue, 0.4);
});
