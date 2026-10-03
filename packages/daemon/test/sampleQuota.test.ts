import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  QuotaSampleInput,
  SampleQuotaDeps,
} from "../src/application/sampleQuota.ts";
import { sampleQuota } from "../src/application/sampleQuota.ts";
import type { CeilingWindow } from "../src/domain/localQuota.ts";
import type { QuotaReading } from "../src/domain/Provider.ts";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const DEFAULT_CEILING = 44_000;

function makeDeps(overrides: Partial<SampleQuotaDeps> = {}): {
  deps: SampleQuotaDeps;
  saved: QuotaSampleInput[];
  savedCeilings: (CeilingWindow & { windowEnd: string })[];
} {
  const saved: QuotaSampleInput[] = [];
  const savedCeilings: (CeilingWindow & { windowEnd: string })[] = [];
  const deps: SampleQuotaDeps = {
    pollQuota: () => Promise.resolve({ authoritative: null, error: null }),
    tokensInWindow: () => 0,
    localFresh: true,
    usageTimestamps: () => [],
    firstUsageAtOrAfter: () => null,
    lastKnownReset: () => null,
    closedCeilings: () => [],
    saveWindowCeiling: (window) => savedCeilings.push(window),
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
  const firstAfter = new Date("2026-01-01T10:00:00.000Z");
  const { deps, saved } = makeDeps({
    lastKnownReset: () => lastReset,
    firstUsageAtOrAfter: () => firstAfter,
    tokensInWindow: (since) => {
      assert.equal(since.toISOString(), firstAfter.toISOString());
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

test("sin endpoint y reset futuro: la ventana empieza en reset − 5h y cuenta tokens", async () => {
  const reset = new Date("2026-01-01T15:00:00.000Z"); // futuro respecto a NOW
  const { deps } = makeDeps({
    lastKnownReset: () => reset,
    tokensInWindow: (since) =>
      since.toISOString() === "2026-01-01T10:00:00.000Z" ? 5_000 : 0,
  });

  const snapshot = await sampleQuota(deps, NOW);

  assert.equal(snapshot.local.windowStartedAt, "2026-01-01T10:00:00.000Z");
  assert.equal(snapshot.local.fiveHourTokens, 5_000);
});

test("sin endpoint y reset de hace 7h: la ventana empieza en el primer mensaje posterior", async () => {
  const first = new Date("2026-01-01T09:00:00.000Z");
  const { deps } = makeDeps({
    lastKnownReset: () => new Date("2026-01-01T05:00:00.000Z"),
    firstUsageAtOrAfter: (t) => (t.getTime() <= first.getTime() ? first : null),
    tokensInWindow: (since) => {
      assert.equal(since.toISOString(), first.toISOString());
      return 3_000;
    },
  });

  const snapshot = await sampleQuota(deps, NOW);

  assert.equal(snapshot.local.windowStartedAt, first.toISOString());
  assert.equal(snapshot.local.fiveHourTokens, 3_000);
});

test("sin endpoint, reset pasado y sin mensajes posteriores: sin ventana activa, 0 tokens", async () => {
  const { deps } = makeDeps({
    lastKnownReset: () => new Date("2026-01-01T05:00:00.000Z"),
    usageTimestamps: () => {
      throw new Error("no debe caer a findGapStart");
    },
    tokensInWindow: () => {
      throw new Error("sin ventana no se consulta");
    },
  });

  const snapshot = await sampleQuota(deps, NOW);

  assert.equal(snapshot.local.windowStartedAt, null);
  assert.equal(snapshot.local.fiveHourTokens, 0);
  assert.equal(snapshot.local.fiveHourUtilization, 0);
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

function endpointReading(utilization: number): QuotaReading {
  return {
    authoritative: {
      fiveHour: { utilization, resetsAt: "2026-01-01T15:00:00.000Z" },
      sevenDay: { utilization: 20, resetsAt: "2026-01-08T00:00:00.000Z" },
      limits: [],
      weeklyBreakdown: null,
    },
    error: null,
  };
}

/** Una ventana cerrada de techo `ceiling` tokens (al 50 %). */
const closed = (ceiling: number): CeilingWindow => ({
  tokens: ceiling / 2,
  utilization: 50,
});

test("por debajo del 30% la ventana no se registra", async () => {
  const { deps, savedCeilings } = makeDeps({
    pollQuota: () => Promise.resolve(endpointReading(29)),
    tokensInWindow: () => 2_000,
  });

  await sampleQuota(deps, NOW);

  assert.deepEqual(savedCeilings, []);
});

test("con utilización suficiente se registra la ventana en curso, sin tocar el techo de esta muestra", async () => {
  const { deps, savedCeilings } = makeDeps({
    pollQuota: () => Promise.resolve(endpointReading(50)),
    tokensInWindow: () => 22_000,
  });

  const snapshot = await sampleQuota(deps, NOW);

  assert.deepEqual(savedCeilings, [
    { windowEnd: "2026-01-01T15:00:00.000Z", tokens: 22_000, utilization: 50 },
  ]);
  // Sin 3 ventanas cerradas sigue valiendo el valor inicial del plan.
  assert.equal(snapshot.local.calibrated, false);
  assert.equal(
    snapshot.local.fiveHourUtilization,
    (22_000 / DEFAULT_CEILING) * 100,
  );
});

test("sin la caché de uso al día la muestra se guarda pero no registra ventana (#98)", async () => {
  // El caso real del 2026-10-02: 37,6 M de tokens congelados contra un 98 %.
  const { deps, saved, savedCeilings } = makeDeps({
    pollQuota: () => Promise.resolve(endpointReading(98)),
    tokensInWindow: () => 37_600_000,
    localFresh: false,
  });

  const snapshot = await sampleQuota(deps, NOW);

  assert.deepEqual(savedCeilings, []);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.fiveHourUtil, 98);
  assert.notEqual(snapshot.divergence, null);
});

test("con tres ventanas cerradas el techo es la mediana, no la última", async () => {
  // Techos 60 M, 90 M y 70 M (la más reciente primero): mediana 70 M.
  const { deps } = makeDeps({
    closedCeilings: () => [
      closed(70_000_000),
      closed(90_000_000),
      closed(60_000_000),
    ],
    tokensInWindow: () => 35_000_000,
  });

  const snapshot = await sampleQuota(deps, NOW);

  assert.equal(snapshot.local.calibrated, true);
  assert.equal(snapshot.local.fiveHourUtilization, 50);
});

test("una muestra intermedia no cambia el techo", async () => {
  const closedWindows = [
    closed(70_000_000),
    closed(90_000_000),
    closed(60_000_000),
  ];
  const utilizations: number[] = [];
  for (const util of [40, 95]) {
    const { deps } = makeDeps({
      pollQuota: () => Promise.resolve(endpointReading(util)),
      closedCeilings: () => closedWindows,
      tokensInWindow: () => 35_000_000,
    });
    utilizations.push((await sampleQuota(deps, NOW)).local.fiveHourUtilization);
  }

  assert.equal(utilizations[0], utilizations[1]);
});

test("ventana en curso con uso externo: tokens fijos y util creciendo dan una divergencia real", async () => {
  const closedWindows = [
    closed(70_000_000),
    closed(90_000_000),
    closed(60_000_000),
  ];
  const divergences: (number | null)[] = [];
  for (const util of [40, 60]) {
    const { deps } = makeDeps({
      pollQuota: () => Promise.resolve(endpointReading(util)),
      closedCeilings: () => closedWindows,
      tokensInWindow: () => 28_000_000, // 40 % del techo de 70 M
    });
    divergences.push((await sampleQuota(deps, NOW)).divergence);
  }

  assert.ok(Math.abs((divergences[0] as number) - 0) < 1e-9);
  assert.ok(Math.abs((divergences[1] as number) - 20) < 1e-9);
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
