import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchQuota,
  parseQuotaResponse,
} from "../src/infrastructure/providers/anthropic/quota.ts";

function fakeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("parseQuotaResponse castea la forma documentada en DESIGN.md §2", () => {
  const result = parseQuotaResponse({
    five_hour: { utilization: 42, resets_at: "2026-01-01T00:00:00Z" },
    seven_day: { utilization: 10, resets_at: "2026-01-07T00:00:00Z" },
    seven_day_opus: null,
    seven_day_sonnet: null,
    extra_usage: { is_enabled: false },
  });

  assert.deepEqual(result, {
    fiveHour: { utilization: 42, resetsAt: "2026-01-01T00:00:00Z" },
    sevenDay: { utilization: 10, resetsAt: "2026-01-07T00:00:00Z" },
    sevenDayOpus: null,
  });
});

test("parseQuotaResponse devuelve null si la forma no encaja", () => {
  assert.equal(parseQuotaResponse({ nope: true }), null);
  assert.equal(parseQuotaResponse(null), null);
  assert.equal(parseQuotaResponse("string"), null);
});

test("200 con la forma documentada: authoritative poblado, error null", async () => {
  const fetchImpl = (async () =>
    fakeResponse(200, {
      five_hour: { utilization: 50, resets_at: "2026-01-01T00:00:00Z" },
      seven_day: { utilization: 20, resets_at: "2026-01-07T00:00:00Z" },
      seven_day_opus: null,
    })) as unknown as typeof fetch;

  const result = await fetchQuota("token", { fetchImpl });

  assert.equal(result.error, null);
  assert.equal(result.authoritative?.fiveHour.utilization, 50);
});

test("404 degrada sin lanzar", async () => {
  const fetchImpl = (async () =>
    fakeResponse(404, { error: "not found" })) as unknown as typeof fetch;

  const result = await fetchQuota("token", { fetchImpl });

  assert.equal(result.authoritative, null);
  assert.match(result.error ?? "", /404/);
});

test("500 degrada sin lanzar", async () => {
  const fetchImpl = (async () =>
    fakeResponse(500, { error: "boom" })) as unknown as typeof fetch;

  const result = await fetchQuota("token", { fetchImpl });

  assert.equal(result.authoritative, null);
  assert.match(result.error ?? "", /500/);
});

test("JSON con forma inesperada degrada igual, no lanza", async () => {
  const fetchImpl = (async () =>
    fakeResponse(200, { totally: "unexpected" })) as unknown as typeof fetch;

  const result = await fetchQuota("token", { fetchImpl });

  assert.equal(result.authoritative, null);
  assert.ok(result.error);
});

test("fallo de red degrada sin lanzar", async () => {
  const fetchImpl = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;

  const result = await fetchQuota("token", { fetchImpl });

  assert.equal(result.authoritative, null);
  assert.match(result.error ?? "", /red/);
});

test("la petición lleva Authorization, anthropic-beta y User-Agent", async () => {
  let capturedInit: RequestInit | undefined;
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    capturedInit = init;
    return fakeResponse(200, {
      five_hour: { utilization: 1, resets_at: "2026-01-01T00:00:00Z" },
      seven_day: { utilization: 1, resets_at: "2026-01-07T00:00:00Z" },
    });
  }) as unknown as typeof fetch;

  await fetchQuota("my-token", { fetchImpl, userAgent: "claude-code/9.9.9" });

  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer my-token");
  assert.equal(headers["anthropic-beta"], "oauth-2025-04-20");
  assert.equal(headers["User-Agent"], "claude-code/9.9.9");
});
