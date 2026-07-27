import assert from "node:assert/strict";
import { test } from "node:test";
import { apiEquivalent, PRICES } from "../src/domain/cost.ts";

test("apiEquivalent distingue los cuatro tipos de token: cache_read es ~10x más barato que input", () => {
  const inputHeavy = apiEquivalent({
    model: "claude-sonnet-5",
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  });
  const cacheReadHeavy = apiEquivalent({
    model: "claude-sonnet-5",
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 1_000_000,
  });

  assert.equal(inputHeavy, PRICES["claude-sonnet-5"]?.input);
  assert.equal(cacheReadHeavy, PRICES["claude-sonnet-5"]?.cacheRead);
  assert.ok(
    cacheReadHeavy < inputHeavy / 5,
    "cache_read debe ser mucho más barato que input",
  );
});

test("sumar los cuatro tipos sin distinguir infla el coste: apiEquivalent no lo hace", () => {
  const mixed = apiEquivalent({
    model: "claude-opus-5",
    inputTokens: 100,
    outputTokens: 100,
    cacheCreationTokens: 100,
    cacheReadTokens: 100,
  });
  const prices = PRICES["claude-opus-5"];
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
    apiEquivalent({
      model: "modelo-que-no-existe",
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }),
    0,
  );
  assert.equal(
    apiEquivalent({
      model: null,
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }),
    0,
  );
});
