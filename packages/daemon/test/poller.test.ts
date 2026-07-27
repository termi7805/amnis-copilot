import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import type { QuotaSnapshot } from "@amnis/shared";
import { startQuotaPoller } from "../src/infrastructure/poller.ts";

const FAKE_SNAPSHOT: QuotaSnapshot = {
  authoritative: null,
  local: {
    fiveHourTokens: 0,
    fiveHourUtilization: 0,
    windowStartedAt: "2026-01-01T00:00:00.000Z",
  },
  divergence: null,
  sampledAt: "2026-01-01T00:00:00.000Z",
  error: null,
};

test("toma una muestra inmediata al arrancar, sin esperar al primer intervalo", async () => {
  const samples: QuotaSnapshot[] = [];
  const stop = startQuotaPoller({
    sample: () => Promise.resolve(FAKE_SNAPSHOT),
    onSample: (s) => samples.push(s),
    intervalMs: 10_000,
  });

  await sleep(5);
  stop();

  assert.equal(samples.length, 1);
});

test("sigue muestreando cada intervalo hasta que se llama a stop()", async () => {
  const samples: QuotaSnapshot[] = [];
  const stop = startQuotaPoller({
    sample: () => Promise.resolve(FAKE_SNAPSHOT),
    onSample: (s) => samples.push(s),
    intervalMs: 15,
  });

  await sleep(50);
  stop();
  const countAtStop = samples.length;
  assert.ok(countAtStop >= 3, `esperaba varias muestras, hubo ${countAtStop}`);

  await sleep(40);
  assert.equal(
    samples.length,
    countAtStop,
    "no deben llegar muestras tras stop()",
  );
});

test("una muestra que rechaza llega a onError y el intervalo sobrevive", async () => {
  let calls = 0;
  const errors: Error[] = [];
  const samples: QuotaSnapshot[] = [];

  const stop = startQuotaPoller({
    sample: () => {
      calls++;
      if (calls === 1) return Promise.reject(new Error("fallo simulado"));
      return Promise.resolve(FAKE_SNAPSHOT);
    },
    onSample: (s) => samples.push(s),
    onError: (e) => errors.push(e),
    intervalMs: 15,
  });

  await sleep(50);
  stop();

  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.message, "fallo simulado");
  assert.ok(
    samples.length >= 1,
    "las muestras posteriores deben seguir llegando",
  );
});

test("una muestra lenta no se solapa: el tick que cae mientras hay una en vuelo se salta", async () => {
  let concurrent = 0;
  let maxConcurrent = 0;

  const stop = startQuotaPoller({
    sample: async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await sleep(40);
      concurrent--;
      return FAKE_SNAPSHOT;
    },
    intervalMs: 10,
  });

  await sleep(80);
  stop();

  assert.equal(maxConcurrent, 1);
});
