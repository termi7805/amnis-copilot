import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import type { QuotaSnapshot } from "@amnis/shared";
import { startQuotaPoller } from "../src/infrastructure/poller.ts";

const FAKE_SNAPSHOT: QuotaSnapshot = {
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
  rateLimitedAt: null,
};

test("toma una muestra inmediata al arrancar, sin esperar al primer intervalo", async () => {
  const samples: QuotaSnapshot[] = [];
  const { stop } = startQuotaPoller({
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
  const { stop } = startQuotaPoller({
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

  const { stop } = startQuotaPoller({
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

  const { stop } = startQuotaPoller({
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

test("pollNow fuerza una muestra sin esperar al intervalo", async () => {
  const samples: QuotaSnapshot[] = [];
  const { stop, pollNow } = startQuotaPoller({
    sample: () => Promise.resolve(FAKE_SNAPSHOT),
    onSample: (s) => samples.push(s),
    intervalMs: 10_000,
  });

  await sleep(5);
  const afterStart = samples.length;

  pollNow();
  await sleep(5);
  stop();

  assert.equal(samples.length, afterStart + 1);
});

test("pollNow durante una muestra en vuelo no apila una segunda — mismo guard que el intervalo", async () => {
  let concurrent = 0;
  let maxConcurrent = 0;

  const { stop, pollNow } = startQuotaPoller({
    sample: async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await sleep(40);
      concurrent--;
      return FAKE_SNAPSHOT;
    },
    intervalMs: 10_000,
  });

  pollNow();
  pollNow();
  await sleep(60);
  stop();

  assert.equal(maxConcurrent, 1);
});

test("sample recibe la muestra anterior y peek devuelve la última (#116)", async () => {
  const seen: (QuotaSnapshot | null)[] = [];
  const second = { ...FAKE_SNAPSHOT, sampledAt: "2026-01-01T00:03:00.000Z" };
  const { stop, pollNow, peek } = startQuotaPoller({
    sample: (previous) => {
      seen.push(previous);
      return Promise.resolve(seen.length === 1 ? FAKE_SNAPSHOT : second);
    },
    intervalMs: 10_000,
  });

  assert.equal(peek(), null);
  await sleep(5);
  assert.equal(peek(), FAKE_SNAPSHOT);

  assert.equal(await pollNow(), second);
  stop();

  assert.deepEqual(seen, [null, FAKE_SNAPSHOT]);
  assert.equal(peek(), second);
});

test("pollNow durante una muestra en vuelo espera a esa, sin lanzar otra (#116)", async () => {
  let calls = 0;
  const { stop, pollNow } = startQuotaPoller({
    sample: async () => {
      calls++;
      await sleep(30);
      return FAKE_SNAPSHOT;
    },
    intervalMs: 10_000,
  });

  const [a, b] = await Promise.all([pollNow(), pollNow()]);
  stop();

  assert.equal(a, FAKE_SNAPSHOT);
  assert.equal(b, FAKE_SNAPSHOT);
  assert.equal(calls, 1);
});

test("current espera a la muestra inicial y después no vuelve a sondear (#116)", async () => {
  let calls = 0;
  const { stop, current } = startQuotaPoller({
    sample: async () => {
      calls++;
      await sleep(20);
      return FAKE_SNAPSHOT;
    },
    intervalMs: 10_000,
  });

  assert.equal(await current(), FAKE_SNAPSHOT);
  assert.equal(await current(), FAKE_SNAPSHOT);
  stop();

  assert.equal(calls, 1);
});

test("pollNow rechaza si la muestra falla, y también va a onError", async () => {
  let calls = 0;
  const errors: Error[] = [];
  const { stop, pollNow } = startQuotaPoller({
    sample: () => {
      calls++;
      return calls === 1
        ? Promise.resolve(FAKE_SNAPSHOT)
        : Promise.reject(new Error("fallo simulado"));
    },
    onError: (e) => errors.push(e),
    intervalMs: 10_000,
  });

  await sleep(5);
  await assert.rejects(pollNow(), /fallo simulado/);
  stop();

  assert.equal(errors.length, 1);
});
