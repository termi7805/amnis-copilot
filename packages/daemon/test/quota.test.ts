import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { formatMessage } from "@amnis/shared";
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
    limits: [
      {
        kind: "session",
        group: "session",
        scope: null,
        utilization: 42,
        resetsAt: "2026-01-01T00:00:00Z",
        severity: "normal",
        isActive: true,
        label: "5h",
      },
      {
        kind: "weekly_all",
        group: "weekly",
        scope: null,
        utilization: 10,
        resetsAt: "2026-01-07T00:00:00Z",
        severity: "normal",
        isActive: true,
        label: "7d",
      },
    ],
    weeklyBreakdown: null,
  });
});

const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/oauth-usage-2026-10.json", import.meta.url),
    "utf8",
  ),
);

test("con la respuesta real, el snapshot trae dos límites: sesión y semanal", () => {
  const result = parseQuotaResponse(fixture);

  assert.deepEqual(
    result?.limits.map((l) => [l.kind, l.label, l.utilization]),
    [
      ["session", "5h", 64],
      ["weekly_all", "7d", 38],
    ],
  );
});

test("un límite con kind y scope desconocidos no se pierde", () => {
  const result = parseQuotaResponse({
    ...fixture,
    limits: [
      ...fixture.limits,
      {
        kind: "kind_inventado",
        group: "weekly",
        percent: 7,
        severity: "raro",
        resets_at: null,
        scope: "scope_inventado",
        is_active: true,
      },
    ],
  });

  assert.equal(result?.limits.length, 3);
  const extra = result?.limits[2];
  assert.equal(extra?.label, "kind_inventado · scope_inventado");
  assert.equal(extra?.severity, "raro");
});

test("sin limits[], respalda con seven_day_<x> válidos e ignora el resto", () => {
  const { limits: _omit, ...sinLimits } = fixture;
  const result = parseQuotaResponse({
    ...sinLimits,
    seven_day_sonnet: { utilization: 5, resets_at: null },
  });

  assert.deepEqual(
    result?.limits.map((l) => l.label),
    ["5h", "7d", "7d · sonnet"],
  );
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
  assert.match(result.error ? formatMessage("es", result.error) : "", /404/);
});

test("429 se marca como rateLimited, tipado y no por el texto (#116)", async () => {
  const fetchImpl = (() =>
    fakeResponse(429, { error: "rate" })) as unknown as typeof fetch;
  const result = await fetchQuota("tok", { fetchImpl });

  assert.equal(result.authoritative, null);
  assert.equal(result.rateLimited, true);
});

test("500 degrada sin lanzar", async () => {
  const fetchImpl = (async () =>
    fakeResponse(500, { error: "boom" })) as unknown as typeof fetch;

  const result = await fetchQuota("token", { fetchImpl });

  assert.equal(result.authoritative, null);
  assert.match(result.error ? formatMessage("es", result.error) : "", /500/);
  assert.equal(result.rateLimited, false);
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
  assert.match(result.error ? formatMessage("es", result.error) : "", /red/);
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

test("con la respuesta real, trae el reparto semanal por origen", () => {
  const result = parseQuotaResponse(fixture);

  assert.deepEqual(result?.weeklyBreakdown?.rows, [
    { key: "claude_code", label: "Claude Code", percent: 100 },
    { key: "chat", label: "Chats", percent: 0 },
    { key: "cowork", label: "Cowork", percent: 0 },
    { key: "other", label: "Other", percent: 0 },
  ]);
  assert.equal(
    result?.weeklyBreakdown?.windowStartedAt,
    "2026-09-28T19:00:00.000485+00:00",
  );
});

test("un origen desconocido del reparto se conserva con su display_name", () => {
  const result = parseQuotaResponse({
    ...fixture,
    seven_day_breakdown: {
      rows: [
        { key: "origen_nuevo", display_name: "Origen nuevo", percent: 3 },
        { key: "sin_nombre", percent: 1 },
        { key: "roto", percent: "x" },
      ],
    },
  });

  assert.deepEqual(result?.weeklyBreakdown?.rows, [
    { key: "origen_nuevo", label: "Origen nuevo", percent: 3 },
    { key: "sin_nombre", label: "sin_nombre", percent: 1 },
  ]);
  assert.equal(result?.weeklyBreakdown?.asOf, null);
});

test("sin seven_day_breakdown o con forma rota, es null y el resto sigue", () => {
  const { seven_day_breakdown: _omit, ...sin } = fixture;
  for (const body of [sin, { ...sin, seven_day_breakdown: { rows: "x" } }]) {
    const result = parseQuotaResponse(body);
    assert.equal(result?.weeklyBreakdown, null);
    assert.equal(result?.limits.length, 2);
  }
});
