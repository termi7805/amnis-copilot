import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  fetchPrices,
  parsePricingMarkdown,
} from "../src/infrastructure/providers/anthropic/pricing.ts";

const page = readFileSync(
  new URL("./fixtures/pricing.md", import.meta.url),
  "utf8",
);

test("la página real da los precios de los modelos nuevos", () => {
  const table = parsePricingMarkdown(page);
  assert.ok(table);
  assert.deepEqual(table["claude-opus-5-5"], {
    input: 4,
    output: 20,
    cacheWrite: 5,
    cacheWrite1h: 8,
    cacheRead: 0.2,
  });
  assert.equal(table["claude-sonnet-5"]?.input, 2);
  assert.equal(table["claude-sonnet-5"]?.output, 10);
});

test("las notas al pie pegadas al precio no rompen el número", () => {
  const table = parsePricingMarkdown(page);
  // `$0.25 / MTok<sup>1</sup>` en la página.
  assert.equal(table?.["claude-fable-5-1"]?.cacheRead, 0.25);
});

test("el texto entre paréntesis y los enlaces se limpian del nombre", () => {
  const table = parsePricingMarkdown(page);
  assert.ok(table?.["claude-mythos-5-1"]);
  assert.ok(table?.["claude-opus-4-1"]);
});

test("solo lee la primera tabla: la de batch no pisa los precios base", () => {
  const table = parsePricingMarkdown(page);
  assert.equal(table?.["claude-opus-5"]?.input, 5);
});

const HEADER =
  "| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |\n| :-- | :-- | :-- | :-- | :-- | :-- |\n";

test("las columnas se buscan por nombre, no por posición", () => {
  const md =
    "| Output tokens | Model | Cache hits and refreshes | 1h cache writes | 5m cache writes | Base input tokens |\n| -- | -- | -- | -- | -- | -- |\n| $20 / MTok | Claude Opus 5.5 | $0.20 / MTok | $8 / MTok | $5 / MTok | $4 / MTok |\n";
  assert.deepEqual(parsePricingMarkdown(md), {
    "claude-opus-5-5": {
      input: 4,
      output: 20,
      cacheWrite: 5,
      cacheWrite1h: 8,
      cacheRead: 0.2,
    },
  });
});

test("un formato irreconocible descarta la tabla entera, nunca una parcial", () => {
  assert.equal(parsePricingMarkdown("# Pricing\n\nNada que ver aquí."), null);
  assert.equal(
    parsePricingMarkdown(HEADER.replace("1h cache writes", "1h writes")),
    null,
    "falta una columna",
  );
  assert.equal(parsePricingMarkdown(HEADER), null, "sin filas");
  assert.equal(
    parsePricingMarkdown(
      `${HEADER}| Claude Opus 5.5 | $4 / MTok | $5 / MTok | $8 / MTok | $0.20 / MTok | $20 / MTok |\n| Claude Raro | Contact sales | $5 / MTok | $8 / MTok | $0.20 / MTok | $20 / MTok |\n`,
    ),
    null,
    "un precio ilegible",
  );
});

test("fetchPrices nunca lanza: red caída, no-2xx y formato raro son {error}", async () => {
  const failing = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  assert.ok("error" in (await fetchPrices({ fetchImpl: failing })));

  const notFound = (async () =>
    new Response("no", { status: 404 })) as unknown as typeof fetch;
  assert.ok("error" in (await fetchPrices({ fetchImpl: notFound })));

  const garbage = (async () =>
    new Response("<html>cambió</html>")) as unknown as typeof fetch;
  assert.ok("error" in (await fetchPrices({ fetchImpl: garbage })));

  const ok = (async () => new Response(page)) as unknown as typeof fetch;
  const reading = await fetchPrices({ fetchImpl: ok });
  assert.ok("prices" in reading);
  assert.equal(reading.prices["claude-sonnet-5-5"]?.input, 2);
});
