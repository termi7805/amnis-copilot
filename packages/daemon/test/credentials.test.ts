import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  isTokenExpired,
  parseCredentialsJson,
  readCredentials,
} from "../src/infrastructure/providers/anthropic/credentials.ts";

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "amnis-credentials-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("CLAUDE_CODE_OAUTH_TOKEN gana sobre el fichero, sin refreshToken/expiresAt", () => {
  const result = readCredentials({
    path: "/no/deberia/leerse.json",
    env: { CLAUDE_CODE_OAUTH_TOKEN: "env-token-abc" },
    platform: "linux",
  });

  assert.ok(result.ok);
  assert.equal(result.token.source, "env");
  assert.equal(result.token.accessToken, "env-token-abc");
  assert.equal(result.token.refreshToken, null);
  assert.equal(result.token.expiresAt, null);
});

test("fichero válido produce ok:true con los campos, incluido subscriptionType", () => {
  withTempDir((dir) => {
    const path = join(dir, "credentials.json");
    writeFileSync(
      path,
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "file-token",
          refreshToken: "refresh-xyz",
          expiresAt: 1893456000000,
          subscriptionType: "max_20x",
          rateLimitTier: "default",
        },
      }),
    );

    const result = readCredentials({ path, env: {}, platform: "linux" });

    assert.ok(result.ok);
    assert.equal(result.token.accessToken, "file-token");
    assert.equal(result.token.refreshToken, "refresh-xyz");
    assert.equal(result.token.expiresAt, 1893456000000);
    assert.equal(result.token.subscriptionType, "max_20x");
    assert.equal(result.token.source, "file");
  });
});

test("sin claude login: ok:false, reason no-session, mensaje accionable", () => {
  withTempDir((dir) => {
    const path = join(dir, "no-existe.json");

    const result = readCredentials({ path, env: {}, platform: "linux" });

    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.equal(result.reason, "no-session");
    assert.match(result.message, /claude login/);
  });
});

test("JSON corrupto: malformed, distinguible de no-session", () => {
  withTempDir((dir) => {
    const path = join(dir, "credentials.json");
    writeFileSync(path, "{ esto no es json");

    const result = readCredentials({ path, env: {}, platform: "linux" });

    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.equal(result.reason, "malformed");
  });
});

test("expiresAt se conserva en epoch ms, no se convierte a ISO", () => {
  const result = parseCredentialsJson(
    JSON.stringify({
      claudeAiOauth: { accessToken: "t", expiresAt: 1893456000000 },
    }),
    "file",
  );

  assert.ok(result.ok);
  assert.equal(typeof result.token.expiresAt, "number");
  assert.equal(result.token.expiresAt, 1893456000000);
});

test("isTokenExpired compara epoch ms directamente", () => {
  const token = {
    accessToken: "t",
    refreshToken: null,
    expiresAt: 1000,
    subscriptionType: null,
    rateLimitTier: null,
    source: "file" as const,
  };

  assert.equal(isTokenExpired(token, new Date(999)), false);
  assert.equal(isTokenExpired(token, new Date(1000)), true);
  assert.equal(
    isTokenExpired({ ...token, expiresAt: null }, new Date(0)),
    false,
  );
});
