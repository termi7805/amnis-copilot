import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { RESOURCES, resolveResources } from "../src/config.ts";

const base = {
  execPath: join("/opt", "amnis", "amnis-daemon"),
  repoRoot: join("/repo"),
};

test("AMNIS_RESOURCES_DIR explícito manda sobre todo lo demás", () => {
  const r = resolveResources({
    ...base,
    resourcesDir: join("/res"),
    sea: true,
  });
  assert.deepEqual(r, {
    webDist: join("/res", "web"),
    dashboardHtml: join("/res", "public", "index.html"),
    hookScript: join("/res", "hooks", "amnis-hook.sh"),
  });
});

test("como binario SEA, los recursos van junto al ejecutable", () => {
  const r = resolveResources({ ...base, resourcesDir: undefined, sea: true });
  const dir = join("/opt", "amnis", "resources");
  assert.equal(r.webDist, join(dir, "web"));
  assert.equal(r.hookScript, join(dir, "hooks", "amnis-hook.sh"));
});

test("con node, apunta a las rutas del repo de siempre", () => {
  const r = resolveResources({ ...base, resourcesDir: undefined, sea: false });
  const repo = join("/repo");
  assert.equal(r.webDist, join(repo, "apps", "web", "dist"));
  assert.equal(
    r.dashboardHtml,
    join(repo, "packages", "daemon", "public", "index.html"),
  );
  assert.equal(
    r.hookScript,
    join(repo, "packages", "daemon", "hooks", "amnis-hook.sh"),
  );
});

test("en este repo, las rutas resueltas existen de verdad", () => {
  assert.ok(existsSync(RESOURCES.dashboardHtml), RESOURCES.dashboardHtml);
  assert.ok(existsSync(RESOURCES.hookScript), RESOURCES.hookScript);
  // apps/web/dist es un artefacto de build: basta con que cuelgue del repo.
  assert.ok(RESOURCES.webDist.endsWith(join("apps", "web", "dist")));
});
