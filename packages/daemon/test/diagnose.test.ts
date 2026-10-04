import assert from "node:assert/strict";
import { test } from "node:test";
import { type DaemonMessage, formatMessage, msg } from "@amnis/shared";
import { type DiagnoseFacts, diagnose } from "../src/application/diagnose.ts";

/** Los tests leen el texto en español, como lo enseña `amnis doctor`. */
const es = (m: DaemonMessage | null) => (m ? formatMessage("es", m) : "");
const raw = (text: string) => msg("raw", { text });

const NOW = new Date("2026-01-02T00:00:00.000Z");

function makeFacts(overrides: Partial<DiagnoseFacts> = {}): DiagnoseFacts {
  return {
    daemonAlive: true,
    amnisHookEvents: ["PreToolUse", "Notification", "Stop"],
    expectedHookEvents: ["PreToolUse", "Notification", "Stop"],
    credentials: { ok: true, expiresAt: null },
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
  assert.ok(es(check.message).includes(REDIRECT));
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
  assert.ok(es(check.remedy).includes("amnis spotify login"));
  assert.ok(es(check.remedy).includes(REDIRECT));
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
  assert.ok(es(check.remedy).includes("install-hooks"));
});

test("token caducado no es un fallo: Claude Code lo renueva al usarse (#136)", () => {
  const checks = diagnose(
    makeFacts({
      credentials: { ok: true, expiresAt: NOW.getTime() - 1000 },
      quotaError: raw("El token de Claude Code caducó"),
    }),
    NOW,
  );
  const token = find(checks, "token");
  assert.equal(token.ok, true);
  assert.match(es(token.message), /Claude Code lo renueva/);
  // El endpoint no se consulta con el token caducado: no es un segundo fallo.
  assert.equal(find(checks, "endpoint").ok, true);
});

test("con el token vigente, un fallo del endpoint sí falla", () => {
  const checks = diagnose(
    makeFacts({
      credentials: { ok: true, expiresAt: NOW.getTime() + 60_000 },
      quotaError: raw("boom"),
    }),
    NOW,
  );
  assert.equal(find(checks, "endpoint").ok, false);
});

test("ingesta nunca hecha falla", () => {
  const checks = diagnose(makeFacts({ lastIngestAt: null }), NOW);
  const check = find(checks, "ingesta");
  assert.equal(check.ok, false);
  assert.ok(es(check.remedy).includes("amnis ingest"));
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

const STALE_AFTER_MS = 360_000;

test("ingesta automática (daemon): sin primera pasada aún no es un fallo", () => {
  const check = find(
    diagnose(
      makeFacts({
        lastIngestAt: null,
        autoIngest: { lastRun: null, staleAfterMs: STALE_AFTER_MS },
      }),
      NOW,
    ),
    "ingesta",
  );
  assert.equal(check.ok, true);
});

test("ingesta automática: una pasada reciente y correcta está bien, aunque ingest_offsets no cambie", () => {
  const check = find(
    diagnose(
      makeFacts({
        lastIngestAt: new Date(NOW.getTime() - 48 * 60 * 60_000),
        autoIngest: {
          lastRun: { at: new Date(NOW.getTime() - 60_000), error: null },
          staleAfterMs: STALE_AFTER_MS,
        },
      }),
      NOW,
    ),
    "ingesta",
  );
  assert.equal(check.ok, true);
});

test("ingesta automática: la última pasada falló, sale el error y un remedio", () => {
  const check = find(
    diagnose(
      makeFacts({
        autoIngest: {
          lastRun: {
            at: new Date(NOW.getTime() - 10_000),
            error: "database is locked",
          },
          staleAfterMs: STALE_AFTER_MS,
        },
      }),
      NOW,
    ),
    "ingesta",
  );
  assert.equal(check.ok, false);
  assert.ok(es(check.message).includes("database is locked"));
  assert.ok(es(check.remedy).includes("amnis ingest"));
});

test("ingesta automática: sin pasada completada en más de 2 intervalos falla", () => {
  const check = find(
    diagnose(
      makeFacts({
        autoIngest: {
          lastRun: {
            at: new Date(NOW.getTime() - STALE_AFTER_MS - 1_000),
            error: null,
          },
          staleAfterMs: STALE_AFTER_MS,
        },
      }),
      NOW,
    ),
    "ingesta",
  );
  assert.equal(check.ok, false);
  assert.ok(check.remedy);
});

test("daemon caído falla con remedio amnis serve", () => {
  const checks = diagnose(makeFacts({ daemonAlive: false }), NOW);
  const check = find(checks, "daemon");
  assert.equal(check.ok, false);
  assert.ok(es(check.remedy).includes("amnis serve"));
});

test("credenciales ilegibles: falla, y token también falla en cascada, ambos con remedio", () => {
  const checks = diagnose(
    makeFacts({ credentials: { ok: false, message: raw("no hay sesión") } }),
    NOW,
  );
  assert.equal(find(checks, "credenciales").ok, false);
  assert.equal(find(checks, "token").ok, false);
});

test("endpoint con error falla con el mensaje del error", () => {
  const checks = diagnose(
    makeFacts({ quotaError: raw("401 no autorizado") }),
    NOW,
  );
  const check = find(checks, "endpoint");
  assert.equal(check.ok, false);
  assert.equal(es(check.message), "401 no autorizado");
});

test("BD con error falla con remedio de permisos o fichero corrupto", () => {
  const checks = diagnose(makeFacts({ dbError: "EACCES" }), NOW);
  const check = find(checks, "base de datos");
  assert.equal(check.ok, false);
  assert.ok(es(check.remedy).includes("permisos"));
  // --rebuild ya no arregla una BD ilegible: no se ofrece como remedio.
  assert.ok(!es(check.remedy).includes("--rebuild"));
});

test("invariante: todo chequeo que falla trae un remedio no nulo", () => {
  const scenarios: Partial<DiagnoseFacts>[] = [
    { daemonAlive: false },
    { amnisHookEvents: [] },
    { credentials: { ok: false, message: raw("x") } },
    { quotaError: raw("boom") },
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
