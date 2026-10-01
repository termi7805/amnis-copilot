import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  readSpotifyToken,
  writeSpotifyConfig,
  writeSpotifyToken,
} from "../src/infrastructure/persistence/spotifyToken.ts";
import type { SpotifyTokenOutcome } from "../src/infrastructure/providers/spotify/oauth.ts";
import { loadSpotifyToken } from "../src/infrastructure/providers/spotify/session.ts";

const NOW = new Date("2026-01-01T12:00:00.000Z");

function setup(token?: { expiresAt: number }) {
  const dir = mkdtempSync(join(tmpdir(), "amnis-spotify-"));
  const configPath = join(dir, "spotify.json");
  const tokenPath = join(dir, "spotify-token.json");
  writeSpotifyConfig({ clientId: "cid" }, configPath);
  if (token) {
    writeSpotifyToken(
      {
        accessToken: "old-access",
        refreshToken: "old-refresh",
        expiresAt: token.expiresAt,
        scope: "s",
      },
      tokenPath,
    );
  }
  return {
    configPath,
    tokenPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const refreshed: SpotifyTokenOutcome = {
  ok: true,
  accessToken: "new-access",
  refreshToken: "new-refresh",
  expiresAt: NOW.getTime() + 3_600_000,
  scope: "s",
};

test("access token caducado en disco (tras reiniciar) se refresca sin pedir login", async () => {
  const s = setup({ expiresAt: NOW.getTime() - 1000 });
  try {
    const calls: string[][] = [];
    const result = await loadSpotifyToken({
      now: NOW,
      configPath: s.configPath,
      tokenPath: s.tokenPath,
      refreshFn: async (clientId, refreshToken) => {
        calls.push([clientId, refreshToken]);
        return refreshed;
      },
    });
    assert.deepEqual(result, { ok: true, accessToken: "new-access" });
    assert.deepEqual(calls, [["cid", "old-refresh"]]);
    assert.equal(readSpotifyToken(s.tokenPath)?.accessToken, "new-access");
    assert.equal(readSpotifyToken(s.tokenPath)?.refreshToken, "new-refresh");
  } finally {
    s.cleanup();
  }
});

test("token vigente no hace ninguna petición", async () => {
  const s = setup({ expiresAt: NOW.getTime() + 3_600_000 });
  try {
    const result = await loadSpotifyToken({
      now: NOW,
      configPath: s.configPath,
      tokenPath: s.tokenPath,
      refreshFn: async () => assert.fail("no debía refrescar"),
    });
    assert.deepEqual(result, { ok: true, accessToken: "old-access" });
  } finally {
    s.cleanup();
  }
});

test("invalid_grant borra el token y vuelve a not-logged-in", async () => {
  const s = setup({ expiresAt: NOW.getTime() - 1000 });
  try {
    const result = await loadSpotifyToken({
      now: NOW,
      configPath: s.configPath,
      tokenPath: s.tokenPath,
      refreshFn: async () => ({ ok: false, permanent: true, message: "x" }),
    });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, "not-logged-in");
    assert.equal(existsSync(s.tokenPath), false);
  } finally {
    s.cleanup();
  }
});

test("fallo transitorio deja el token intacto", async () => {
  const s = setup({ expiresAt: NOW.getTime() - 1000 });
  try {
    const result = await loadSpotifyToken({
      now: NOW,
      configPath: s.configPath,
      tokenPath: s.tokenPath,
      refreshFn: async () => ({ ok: false, permanent: false, message: "red" }),
    });
    assert.equal(!result.ok && result.reason, "refresh-failed");
    assert.equal(readSpotifyToken(s.tokenPath)?.accessToken, "old-access");
  } finally {
    s.cleanup();
  }
});

test("dos llamadas concurrentes comparten un solo refresh", async () => {
  const s = setup({ expiresAt: NOW.getTime() - 1000 });
  try {
    let calls = 0;
    const opts = {
      now: NOW,
      configPath: s.configPath,
      tokenPath: s.tokenPath,
      refreshFn: async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 10));
        return refreshed;
      },
    };
    await Promise.all([loadSpotifyToken(opts), loadSpotifyToken(opts)]);
    assert.equal(calls, 1);
  } finally {
    s.cleanup();
  }
});

test("sin Client ID o sin token da el motivo correcto", async () => {
  const s = setup();
  try {
    const noToken = await loadSpotifyToken({
      now: NOW,
      configPath: s.configPath,
      tokenPath: s.tokenPath,
    });
    assert.equal(!noToken.ok && noToken.reason, "not-logged-in");
    const noClient = await loadSpotifyToken({
      now: NOW,
      configPath: join(s.configPath, "inexistente"),
      tokenPath: s.tokenPath,
    });
    assert.equal(!noClient.ok && noClient.reason, "no-client-id");
  } finally {
    s.cleanup();
  }
});

test("el token se escribe con permisos 0600", {
  skip: process.platform === "win32",
}, () => {
  const s = setup({ expiresAt: NOW.getTime() });
  try {
    assert.equal(statSync(s.tokenPath).mode & 0o777, 0o600);
  } finally {
    s.cleanup();
  }
});
