import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadToken } from "../src/infrastructure/providers/anthropic/credentials.ts";
import type { RefreshOutcome } from "../src/infrastructure/providers/anthropic/oauthClient.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "amnis-loadtoken-"));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeCredentials(
  path: string,
  overrides: Partial<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }> = {},
): void {
  writeFileSync(
    path,
    JSON.stringify({
      claudeAiOauth: {
        accessToken: overrides.accessToken ?? "original-access",
        refreshToken: overrides.refreshToken ?? "original-refresh",
        expiresAt: overrides.expiresAt ?? 1000,
        subscriptionType: "pro",
        rateLimitTier: "default",
      },
    }),
  );
}

test("token no caducado: no llama a refresh", async () => {
  await withTempDir(async (dir) => {
    const credsPath = join(dir, "credentials.json");
    const cachePath = join(dir, "token.json");
    writeCredentials(credsPath, { expiresAt: 9_999_999_999_999 });

    let calls = 0;
    const refreshFn = async (): Promise<RefreshOutcome> => {
      calls++;
      throw new Error("no debería llamarse");
    };

    const result = await loadToken({
      path: credsPath,
      cachePath,
      env: {},
      platform: "linux",
      now: new Date(0),
      refreshFn,
    });

    assert.ok(result.ok);
    assert.equal(result.token.accessToken, "original-access");
    assert.equal(calls, 0);
  });
});

test("caducado, sin cache: refresca y persiste ~/.amnis/token.json", async () => {
  await withTempDir(async (dir) => {
    const credsPath = join(dir, "credentials.json");
    const cachePath = join(dir, "token.json");
    writeCredentials(credsPath, { expiresAt: 1000 });

    let calls = 0;
    const refreshFn = async (): Promise<RefreshOutcome> => {
      calls++;
      return {
        ok: true,
        accessToken: "refreshed-access",
        refreshToken: "refreshed-refresh",
        expiresAt: 5000,
      };
    };

    const result = await loadToken({
      path: credsPath,
      cachePath,
      env: {},
      platform: "linux",
      now: new Date(2000),
      refreshFn,
    });

    assert.ok(result.ok);
    assert.equal(result.token.accessToken, "refreshed-access");
    assert.equal(calls, 1);
    assert.ok(existsSync(cachePath));

    const cached = JSON.parse(readFileSync(cachePath, "utf8"));
    assert.equal(cached.refreshedToken.accessToken, "refreshed-access");
    assert.equal(cached.lastPermanentFailureAt, null);
  });
});

test("caducado, cache válida con mismo mtime: reusa cache, no vuelve a refrescar", async () => {
  await withTempDir(async (dir) => {
    const credsPath = join(dir, "credentials.json");
    const cachePath = join(dir, "token.json");
    writeCredentials(credsPath, { expiresAt: 1000 });
    const mtimeMs = statSync(credsPath).mtimeMs;

    writeFileSync(
      cachePath,
      JSON.stringify({
        refreshedToken: {
          accessToken: "cached-access",
          refreshToken: "cached-refresh",
          expiresAt: 999_999_999_999,
        },
        sourceCredentialsMtimeMs: mtimeMs,
        lastPermanentFailureAt: null,
      }),
    );

    let calls = 0;
    const refreshFn = async (): Promise<RefreshOutcome> => {
      calls++;
      throw new Error("no debería llamarse: la cache ya es válida");
    };

    const result = await loadToken({
      path: credsPath,
      cachePath,
      env: {},
      platform: "linux",
      now: new Date(2000),
      refreshFn,
    });

    assert.ok(result.ok);
    assert.equal(result.token.accessToken, "cached-access");
    assert.equal(calls, 0);
  });
});

test("401 permanente: degrada, y una segunda llamada con el mismo mtime no vuelve a refrescar", async () => {
  await withTempDir(async (dir) => {
    const credsPath = join(dir, "credentials.json");
    const cachePath = join(dir, "token.json");
    writeCredentials(credsPath, { expiresAt: 1000 });

    let calls = 0;
    const refreshFn = async (): Promise<RefreshOutcome> => {
      calls++;
      return { ok: false, permanent: true, message: "401" };
    };

    const first = await loadToken({
      path: credsPath,
      cachePath,
      env: {},
      platform: "linux",
      now: new Date(2000),
      refreshFn,
    });
    assert.equal(first.ok, false);
    assert.equal(calls, 1);

    const second = await loadToken({
      path: credsPath,
      cachePath,
      env: {},
      platform: "linux",
      now: new Date(3000),
      refreshFn,
    });

    assert.equal(second.ok, false);
    assert.ok(!second.ok);
    assert.equal(second.reason, "refresh-failed");
    assert.equal(calls, 1, "no debe volver a llamar a refresh tras un 401");
  });
});

test("fallo de red: degrada pero no marca el fallo como permanente", async () => {
  await withTempDir(async (dir) => {
    const credsPath = join(dir, "credentials.json");
    const cachePath = join(dir, "token.json");
    writeCredentials(credsPath, { expiresAt: 1000 });

    const refreshFn = async (): Promise<RefreshOutcome> => ({
      ok: false,
      permanent: false,
      message: "network error",
    });

    const result = await loadToken({
      path: credsPath,
      cachePath,
      env: {},
      platform: "linux",
      now: new Date(2000),
      refreshFn,
    });

    assert.equal(result.ok, false);
    const cached = JSON.parse(readFileSync(cachePath, "utf8"));
    assert.equal(cached.lastPermanentFailureAt, null);
  });
});

test("el mtime de ~/.claude/.credentials.json no cambia tras loadToken()", async () => {
  await withTempDir(async (dir) => {
    const credsPath = join(dir, "credentials.json");
    const cachePath = join(dir, "token.json");
    writeCredentials(credsPath, { expiresAt: 1000 });
    const before = statSync(credsPath).mtimeMs;

    const refreshFn = async (): Promise<RefreshOutcome> => ({
      ok: true,
      accessToken: "a",
      refreshToken: "r",
      expiresAt: 9999,
    });

    await loadToken({
      path: credsPath,
      cachePath,
      env: {},
      platform: "linux",
      now: new Date(2000),
      refreshFn,
    });

    const after = statSync(credsPath).mtimeMs;
    assert.equal(after, before);
  });
});

test("el token.json escrito tiene permisos 0600", async () => {
  await withTempDir(async (dir) => {
    const credsPath = join(dir, "credentials.json");
    const cachePath = join(dir, "token.json");
    writeCredentials(credsPath, { expiresAt: 1000 });

    const refreshFn = async (): Promise<RefreshOutcome> => ({
      ok: true,
      accessToken: "a",
      refreshToken: "r",
      expiresAt: 9999,
    });

    await loadToken({
      path: credsPath,
      cachePath,
      env: {},
      platform: "linux",
      now: new Date(2000),
      refreshFn,
    });

    const mode = statSync(cachePath).mode & 0o777;
    assert.equal(mode, 0o600);
  });
});
