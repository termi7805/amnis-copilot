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
    spotify: {
      hasClientId: true,
      token: "valid",
      redirectUri: "http://127.0.0.1:4747/api/spotify/callback",
    },
    ...overrides,
  };
}

function find(checks: ReturnType<typeof diagnose>, name: string) {
  const check = checks.find((c) => c.name === name);
  assert.ok(check, `no se encontró el chequeo "${name}"`);
  return check;
}

test("todo en verde produce ocho chequeos, todos ok", () => {
  const checks = diagnose(makeFacts(), NOW);
  assert.equal(checks.length, 8);
  assert.ok(checks.every((c) => c.ok));
});

const REDIRECT = "http://127.0.0.1:4747/api/spotify/callback";

test("spotify sin Client ID no es un fallo y da el redirect URI", () => {
  const check = find(
    diagnose(
      makeFacts({
        spotify: { hasClientId: false, token: "none", redirectUri: REDIRECT },
      }),
      NOW,
    ),
    "spotify",
  );
  assert.equal(check.ok, true);
  assert.ok(check.message.includes(REDIRECT));
});

test("spotify con Client ID y sin login falla y el remedio da el comando y el redirect URI", () => {
  const check = find(
    diagnose(
      makeFacts({
        spotify: { hasClientId: true, token: "none", redirectUri: REDIRECT },
      }),
      NOW,
    ),
    "spotify",
  );
  assert.equal(check.ok, false);
  assert.ok(check.remedy?.includes("amnis spotify login"));
  assert.ok(check.remedy?.includes(REDIRECT));
});

test("spotify con token caducado pero renovable es ok", () => {
  const check = find(
    diagnose(
      makeFacts({
        spotify: {
          hasClientId: true,
          token: "expired-refreshable",
          redirectUri: REDIRECT,
        },
      }),
      NOW,
    ),
    "spotify",
  );
  assert.equal(check.ok, true);
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

test("BD con error falla con remedio de permisos o fichero corrupto", () => {
  const checks = diagnose(makeFacts({ dbError: "EACCES" }), NOW);
  const check = find(checks, "base de datos");
  assert.equal(check.ok, false);
  assert.ok(check.remedy?.includes("permisos"));
  // --rebuild ya no arregla una BD ilegible: no se ofrece como remedio.
  assert.ok(!check.remedy?.includes("--rebuild"));
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
