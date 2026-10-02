import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apiEquivalent,
  normalizeModelId,
  SEED_PRICES,
} from "../src/domain/cost.ts";

test("apiEquivalent distingue los cuatro tipos de token: cache_read es ~10x más barato que input", () => {
  const inputHeavy = apiEquivalent(
    {
      model: "claude-sonnet-5",
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    },
    SEED_PRICES,
  );
  const cacheReadHeavy = apiEquivalent(
    {
      model: "claude-sonnet-5",
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 1_000_000,
    },
    SEED_PRICES,
  );

  assert.equal(inputHeavy, SEED_PRICES["claude-sonnet-5"]?.input);
  assert.equal(cacheReadHeavy, SEED_PRICES["claude-sonnet-5"]?.cacheRead);
  assert.ok(
    cacheReadHeavy < inputHeavy / 5,
    "cache_read debe ser mucho más barato que input",
  );
});

test("sumar los cuatro tipos sin distinguir infla el coste: apiEquivalent no lo hace", () => {
  const mixed = apiEquivalent(
    {
      model: "claude-opus-5",
      inputTokens: 100,
      outputTokens: 100,
      cacheCreationTokens: 100,
      cacheReadTokens: 100,
    },
    SEED_PRICES,
  );
  const prices = SEED_PRICES["claude-opus-5"];
  assert.ok(prices);
  const expected =
    (100 * prices.input +
      100 * prices.output +
      100 * prices.cacheWrite +
      100 * prices.cacheRead) /
    1_000_000;
  assert.equal(mixed, expected);

  // La trampa: tratar los cuatro como "input" infla el coste varias veces.
  const wrongIfSummedAsInput = (400 * prices.input) / 1_000_000;
  assert.notEqual(mixed, wrongIfSummedAsInput);
});

test("modelo desconocido (incluido null) da coste 0, nunca una estimación inventada", () => {
  assert.equal(
    apiEquivalent(
      {
        model: "modelo-que-no-existe",
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      SEED_PRICES,
    ),
    0,
  );
  assert.equal(
    apiEquivalent(
      {
        model: null,
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      SEED_PRICES,
    ),
    0,
  );
});

test("el ID con fecha de los JSONL encuentra su precio: Haiku no cuenta 0", () => {
  assert.equal(
    normalizeModelId("claude-haiku-4-5-20251001"),
    "claude-haiku-4-5",
  );
  assert.equal(
    apiEquivalent(
      {
        model: "claude-haiku-4-5-20251001",
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      SEED_PRICES,
    ),
    SEED_PRICES["claude-haiku-4-5"]?.input,
  );
});
