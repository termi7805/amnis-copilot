import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { RESOURCES, resolveResources } from "../src/config.ts";

const base = { execPath: "/opt/amnis/amnis-daemon", repoRoot: "/repo" };

test("AMNIS_RESOURCES_DIR explícito manda sobre todo lo demás", () => {
  const r = resolveResources({ ...base, resourcesDir: "/res", sea: true });
  assert.deepEqual(r, {
    webDist: "/res/web",
    dashboardHtml: "/res/public/index.html",
    hookScript: "/res/hooks/amnis-hook.sh",
  });
});

test("como binario SEA, los recursos van junto al ejecutable", () => {
  const r = resolveResources({ ...base, resourcesDir: undefined, sea: true });
  assert.equal(r.webDist, "/opt/amnis/resources/web");
  assert.equal(r.hookScript, "/opt/amnis/resources/hooks/amnis-hook.sh");
});

test("con node, apunta a las rutas del repo de siempre", () => {
  const r = resolveResources({ ...base, resourcesDir: undefined, sea: false });
  assert.equal(r.webDist, "/repo/apps/web/dist");
  assert.equal(r.dashboardHtml, "/repo/packages/daemon/public/index.html");
  assert.equal(r.hookScript, "/repo/packages/daemon/hooks/amnis-hook.sh");
});

test("en este repo, las rutas resueltas existen de verdad", () => {
  assert.ok(existsSync(RESOURCES.dashboardHtml), RESOURCES.dashboardHtml);
  assert.ok(existsSync(RESOURCES.hookScript), RESOURCES.hookScript);
  // apps/web/dist es un artefacto de build: basta con que cuelgue del repo.
  assert.ok(RESOURCES.webDist.endsWith(join("apps", "web", "dist")));
});
