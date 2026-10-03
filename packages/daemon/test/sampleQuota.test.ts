import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  QuotaSampleInput,
  SampleQuotaDeps,
} from "../src/application/sampleQuota.ts";
import { sampleQuota } from "../src/application/sampleQuota.ts";
import type { QuotaReading } from "../src/domain/Provider.ts";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const DEFAULT_CEILING = 44_000;

function makeDeps(overrides: Partial<SampleQuotaDeps> = {}): {
  deps: SampleQuotaDeps;
  saved: QuotaSampleInput[];
  savedCeilings: number[];
} {
  const saved: QuotaSampleInput[] = [];
  const savedCeilings: number[] = [];
  const deps: SampleQuotaDeps = {
    pollQuota: () => Promise.resolve({ authoritative: null, error: null }),
    tokensInWindow: () => 0,
    localFresh: true,
    usageTimestamps: () => [],
    lastKnownReset: () => null,
    getPlanWindowTokens: () => null,
    savePlanWindowTokens: (tokens) => savedCeilings.push(tokens),
    defaultPlanWindowTokens: DEFAULT_CEILING,
    fiveHourSamplesSince: () => [],
    insertQuotaSample: (sample) => saved.push(sample),
    ...overrides,
  };
  return { deps, saved, savedCeilings };
}

test("con endpoint: inicio de ventana = resets_at - 5h, divergencia = autoritativo - local", async () => {
  const reading: QuotaReading = {
    authoritative: {
      fiveHour: { utilization: 50, resetsAt: "2026-01-01T15:00:00.000Z" },
      sevenDay: { utilization: 20, resetsAt: "2026-01-08T00:00:00.000Z" },
      limits: [],
      weeklyBreakdown: null,
    },
    error: null,
  };
  const { deps, saved } = makeDeps({
    pollQuota: () => Promise.resolve(reading),
    tokensInWindow: () => 22_000,
  });

  const snapshot = await sampleQuota(deps, NOW);

  assert.equal(snapshot.local.windowStartedAt, "2026-01-01T10:00:00.000Z");
  assert.equal(snapshot.local.fiveHourUtilization, 50);
  assert.equal(snapshot.divergence, 0);
  assert.equal(saved[0]?.source, "both");
});

test("sin endpoint: se usa el último reset conocido, la estimación local sigue saliendo y la divergencia es null", async () => {
  const lastReset = new Date("2026-01-01T09:00:00.000Z");
  const { deps, saved } = makeDeps({
    lastKnownReset: () => lastReset,
    tokensInWindow: (since) => {
      assert.equal(since.toISOString(), lastReset.toISOString());
      return 11_000;
    },
  });

  const snapshot = await sampleQuota(deps, NOW);

  assert.equal(snapshot.authoritative, null);
  assert.equal(snapshot.divergence, null);
  assert.equal(
    snapshot.local.fiveHourUtilization,
    (11_000 / DEFAULT_CEILING) * 100,
  );
  assert.equal(saved[0]?.source, "local");
});

test("sin endpoint y sin reset conocido: cae a findGapStart sobre los timestamps locales", async () => {
  const { deps } = makeDeps({
    usageTimestamps: () => [
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-01T11:00:00.000Z"), // hueco > 5h: la ventana actual empieza aquí
    ],
  });

  const snapshot = await sampleQuota(deps, NOW);

  assert.equal(snapshot.local.windowStartedAt, "2026-01-01T11:00:00.000Z");
});

test("utilización autoritativa por debajo del 10% no toca el techo calibrado", async () => {
  const reading: QuotaReading = {
    authoritative: {
      fiveHour: { utilization: 5, resetsAt: "2026-01-01T15:00:00.000Z" },
      sevenDay: { utilization: 5, resetsAt: "2026-01-08T00:00:00.000Z" },
      limits: [],
      weeklyBreakdown: null,
    },
    error: null,
  };
  const { deps, savedCeilings } = makeDeps({
    pollQuota: () => Promise.resolve(reading),
    tokensInWindow: () => 2_000,
  });

  await sampleQuota(deps, NOW);

  assert.deepEqual(savedCeilings, []);
});

test("un techo de 0 almacenado (#46) no se usa: cae al default en vez de dividir entre 0", async () => {
  const { deps, saved } = makeDeps({
    getPlanWindowTokens: () => 0,
    tokensInWindow: () => 500,
  });

  const snapshot = await sampleQuota(deps, NOW);

  assert.equal(
    snapshot.local.fiveHourUtilization,
    (500 / DEFAULT_CEILING) * 100,
  );
  assert.ok(Number.isFinite(saved[0]?.localUtil));
});

test("utilización autoritativa suficiente calibra el techo del plan", async () => {
  const reading: QuotaReading = {
    authoritative: {
      fiveHour: { utilization: 50, resetsAt: "2026-01-01T15:00:00.000Z" },
      sevenDay: { utilization: 20, resetsAt: "2026-01-08T00:00:00.000Z" },
      limits: [],
      weeklyBreakdown: null,
    },
    error: null,
  };
  const { deps, savedCeilings } = makeDeps({
    pollQuota: () => Promise.resolve(reading),
    tokensInWindow: () => 22_000,
  });

  await sampleQuota(deps, NOW);

  assert.deepEqual(savedCeilings, [44_000]);
});

test("sin la caché de uso al día la muestra se guarda pero no calibra el techo (#98)", async () => {
  const reading: QuotaReading = {
    authoritative: {
      fiveHour: { utilization: 98, resetsAt: "2026-01-01T15:00:00.000Z" },
      sevenDay: { utilization: 20, resetsAt: "2026-01-08T00:00:00.000Z" },
      limits: [],
      weeklyBreakdown: null,
    },
    error: null,
  };
  // El caso real del 2026-10-02: 37,6 M de tokens congelados contra un 98 %.
  const { deps, saved, savedCeilings } = makeDeps({
    pollQuota: () => Promise.resolve(reading),
    tokensInWindow: () => 37_600_000,
    localFresh: false,
  });

  const snapshot = await sampleQuota(deps, NOW);

  assert.deepEqual(savedCeilings, []);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.fiveHourUtil, 98);
  assert.notEqual(snapshot.divergence, null);
});

test("proyección: con endpoint y muestras previas da el valor al reset; sin endpoint, null", async () => {
  // Ventana 10:00-15:00. Ritmo de 10 %/h hasta las 12:00 (20 %): 50 al reset.
  const previas = [0, 20, 40, 60, 80, 100, 117].map((m) => ({
    at: new Date(new Date("2026-01-01T10:00:00.000Z").getTime() + m * 60_000),
    utilization: (10 * m) / 60,
  }));
  const { deps } = makeDeps({
    pollQuota: () =>
      Promise.resolve({
        authoritative: {
          fiveHour: { utilization: 20, resetsAt: "2026-01-01T15:00:00.000Z" },
          sevenDay: { utilization: 5, resetsAt: "2026-01-08T00:00:00.000Z" },
          limits: [],
          weeklyBreakdown: null,
        },
        error: null,
      }),
    fiveHourSamplesSince: () => previas,
  });
  const con = await sampleQuota(deps, new Date("2026-01-01T12:00:00.000Z"));
  const value = con.projection.fiveHourAtReset;
  assert.ok(value !== null && Math.abs(value - 50) < 1e-6);

  const { deps: sinEndpoint } = makeDeps();
  const sin = await sampleQuota(sinEndpoint, NOW);
  assert.equal(sin.projection.fiveHourAtReset, null);
});
