import assert from "node:assert/strict";
import { test } from "node:test";
import { refreshPrices } from "../src/application/refreshPrices.ts";
import {
  type ModelPrices,
  SEED_PRICES,
  SEED_PRICES_DATE,
} from "../src/domain/cost.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import {
  currentPrices,
  savePrices,
} from "../src/infrastructure/persistence/prices.ts";

const P: ModelPrices = {
  input: 1,
  output: 2,
  cacheWrite: 3,
  cacheWrite1h: 4,
  cacheRead: 0.5,
};

test("sin nada descargado vale la semilla, con su fecha", () => {
  const db = openDb(":memory:");
  const { prices, updatedAt } = currentPrices(db);
  assert.deepEqual(prices, SEED_PRICES);
  assert.equal(updatedAt, SEED_PRICES_DATE);
});

test("lo descargado pisa la semilla y la fecha es la de la descarga", () => {
  const db = openDb(":memory:");
  savePrices(db, { "claude-opus-5-5": P }, "2026-11-01T10:00:00.000Z");
  const { prices, updatedAt } = currentPrices(db);
  assert.deepEqual(prices["claude-opus-5-5"], P);
  assert.deepEqual(prices["claude-sonnet-5"], SEED_PRICES["claude-sonnet-5"]);
  assert.equal(updatedAt, "2026-11-01");
});

test("un modelo que desaparece de la página conserva su último precio", () => {
  const db = openDb(":memory:");
  savePrices(db, { "claude-retirado": P }, "2026-11-01T00:00:00.000Z");
  savePrices(
    db,
    { "claude-opus-5-5": { ...P, input: 9 } },
    "2026-11-02T00:00:00.000Z",
  );
  const { prices } = currentPrices(db);
  assert.deepEqual(prices["claude-retirado"], P);
  assert.equal(prices["claude-opus-5-5"]?.input, 9);
});

test("una descarga fallida no toca la tabla guardada", async () => {
  const db = openDb(":memory:");
  savePrices(db, { "claude-opus-5-5": P }, "2026-11-01T00:00:00.000Z");
  const before = currentPrices(db);

  const result = await refreshPrices(
    {
      fetchPrices: async () => ({ error: "formato irreconocible" }),
      savePrices: (prices, fetchedAt) => savePrices(db, prices, fetchedAt),
    },
    new Date("2026-11-05T00:00:00.000Z"),
  );

  assert.equal(result.error, "formato irreconocible");
  assert.deepEqual(currentPrices(db), before);
});

test("una descarga buena se guarda con la fecha de ahora", async () => {
  const db = openDb(":memory:");
  const result = await refreshPrices(
    {
      fetchPrices: async () => ({ prices: { "claude-opus-5-5": P } }),
      savePrices: (prices, fetchedAt) => savePrices(db, prices, fetchedAt),
    },
    new Date("2026-11-05T08:00:00.000Z"),
  );
  assert.equal(result.error, null);
  assert.equal(currentPrices(db).updatedAt, "2026-11-05");
});
