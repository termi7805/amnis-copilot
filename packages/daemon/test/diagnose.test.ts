import assert from "node:assert/strict";
import { test } from "node:test";
import { type DiagnoseFacts, diagnose } from "../src/application/diagnose.ts";

const NOW = new Date("2026-01-02T00:00:00.000Z");

function makeFacts(overrides: Partial<DiagnoseFacts> = {}): DiagnoseFacts {
  return {
    daemonAlive: true,
    amnisHookEvents: ["PreToolUse", "Notification", "Stop"],
    expectedHookEvents: ["PreToolUse", "Notification", "Stop"],
    credentials: { ok: true, expiresAt: null, hasRefreshToken: true },
    quotaError: null,
    dbError: null,
    lastIngestAt: new Date("2026-01-01T23:00:00.000Z"),
    ...overrides,
  };
}

function find(checks: ReturnType<typeof diagnose>, name: string) {
  const check = checks.find((c) => c.name === name);
  assert.ok(check, `no se encontró el chequeo "${name}"`);
  return check;
}

test("todo en verde produce siete chequeos, todos ok", () => {
  const checks = diagnose(makeFacts(), NOW);
  assert.equal(checks.length, 7);
  assert.ok(checks.every((c) => c.ok));
});

test("hooks desinstalados: el chequeo falla y el remedio menciona install-hooks", () => {
  const checks = diagnose(makeFacts({ amnisHookEvents: [] }), NOW);
  const check = find(checks, "hooks");
  assert.equal(check.ok, false);
  assert.ok(check.remedy?.includes("install-hooks"));
});

test("token caducado sin refresh token: falla y el remedio menciona claude login", () => {
  const checks = diagnose(
    makeFacts({
      credentials: {
        ok: true,
        expiresAt: NOW.getTime() - 1000,
        hasRefreshToken: false,
      },
    }),
    NOW,
  );
  const check = find(checks, "token");
  assert.equal(check.ok, false);
  assert.ok(check.remedy?.includes("claude login"));
});

test("token caducado con refresh token disponible no es un fallo", () => {
  const checks = diagnose(
    makeFacts({
      credentials: {
        ok: true,
        expiresAt: NOW.getTime() - 1000,
        hasRefreshToken: true,
      },
    }),
    NOW,
  );
  assert.equal(find(checks, "token").ok, true);
});

test("ingesta nunca hecha falla", () => {
  const checks = diagnose(makeFacts({ lastIngestAt: null }), NOW);
  const check = find(checks, "ingesta");
  assert.equal(check.ok, false);
  assert.ok(check.remedy?.includes("amnis ingest"));
});

test("ingesta de hace 25h falla, de hace 1h no", () => {
  const stale = diagnose(
    makeFacts({ lastIngestAt: new Date(NOW.getTime() - 25 * 60 * 60_000) }),
    NOW,
  );
  assert.equal(find(stale, "ingesta").ok, false);

  const fresh = diagnose(
    makeFacts({ lastIngestAt: new Date(NOW.getTime() - 60 * 60_000) }),
    NOW,
  );
  assert.equal(find(fresh, "ingesta").ok, true);
});

test("daemon caído falla con remedio amnis serve", () => {
  const checks = diagnose(makeFacts({ daemonAlive: false }), NOW);
  const check = find(checks, "daemon");
  assert.equal(check.ok, false);
  assert.ok(check.remedy?.includes("amnis serve"));
});

test("credenciales ilegibles: falla, y token también falla en cascada, ambos con remedio", () => {
  const checks = diagnose(
    makeFacts({ credentials: { ok: false, message: "no hay sesión" } }),
    NOW,
  );
  assert.equal(find(checks, "credenciales").ok, false);
  assert.equal(find(checks, "token").ok, false);
});

test("endpoint con error falla con el mensaje del error", () => {
  const checks = diagnose(makeFacts({ quotaError: "401 no autorizado" }), NOW);
  const check = find(checks, "endpoint");
  assert.equal(check.ok, false);
  assert.equal(check.message, "401 no autorizado");
});

test("BD con error falla con remedio de permisos o rebuild", () => {
  const checks = diagnose(makeFacts({ dbError: "EACCES" }), NOW);
  const check = find(checks, "base de datos");
  assert.equal(check.ok, false);
  assert.ok(check.remedy?.includes("ingest --rebuild"));
});

test("invariante: todo chequeo que falla trae un remedio no nulo", () => {
  const scenarios: Partial<DiagnoseFacts>[] = [
    { daemonAlive: false },
    { amnisHookEvents: [] },
    { credentials: { ok: false, message: "x" } },
    {
      credentials: {
        ok: true,
        expiresAt: NOW.getTime() - 1,
        hasRefreshToken: false,
      },
    },
    { quotaError: "boom" },
    { dbError: "boom" },
    { lastIngestAt: null },
  ];

  for (const overrides of scenarios) {
    const checks = diagnose(makeFacts(overrides), NOW);
    for (const check of checks) {
      if (!check.ok)
        assert.notEqual(check.remedy, null, `${check.name} falló sin remedio`);
    }
  }
});
