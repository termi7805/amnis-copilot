import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProviderId } from "@amnis/shared";
import { ingestAllProviders } from "../src/application/ingestUsage.ts";
import type {
  IngestResult,
  Provider,
  ProviderUsageEvent,
  QuotaReading,
  UsageStore,
} from "../src/domain/Provider.ts";

const FAKE_ID = "fake-provider" as ProviderId;

const fakeUsageEvent: ProviderUsageEvent = {
  dedupeKey: "fake-1",
  sessionId: null,
  project: null,
  ts: "2026-01-01T00:00:00.000Z",
  model: null,
  inputTokens: 10,
  outputTokens: 5,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  serviceTier: null,
  gitBranch: null,
};

function makeFakeProvider(): Provider {
  return {
    id: FAKE_ID,
    ingestHistorical(store: UsageStore): IngestResult {
      const inserted = store.insertUsageEvent(FAKE_ID, fakeUsageEvent);
      return {
        filesScanned: 1,
        linesRead: 1,
        eventsInserted: inserted ? 1 : 0,
        duplicatesSkipped: inserted ? 0 : 1,
      };
    },
    pollQuota(): Promise<QuotaReading> {
      return Promise.resolve({ authoritative: null, error: null });
    },
    normalizeHookEvent: () => null,
  };
}

test("ingestAllProviders recorre un provider de mentira y suma su resultado", () => {
  const insertedWithProvider: ProviderId[] = [];
  const store: UsageStore = {
    getOffset: () => undefined,
    saveOffset: () => {},
    insertUsageEvent: (providerId) => {
      insertedWithProvider.push(providerId);
      return true;
    },
  };

  const result = ingestAllProviders([makeFakeProvider()], store);

  assert.equal(result.eventsInserted, 1);
  assert.equal(result.filesScanned, 1);
});

test("el evento insertado lleva el id del provider que lo produjo, no uno hardcodeado", () => {
  const insertedWithProvider: ProviderId[] = [];
  const store: UsageStore = {
    getOffset: () => undefined,
    saveOffset: () => {},
    insertUsageEvent: (providerId) => {
      insertedWithProvider.push(providerId);
      return true;
    },
  };

  ingestAllProviders([makeFakeProvider()], store);

  assert.deepEqual(insertedWithProvider, [FAKE_ID]);
  assert.notEqual(insertedWithProvider[0], "anthropic");
});
