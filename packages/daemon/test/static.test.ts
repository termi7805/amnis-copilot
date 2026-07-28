import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createHttpServer } from "../src/infrastructure/http/server.ts";
import { createStaticRoute } from "../src/infrastructure/http/static.ts";

function withDist(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "amnis-dist-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><body>spa</body>");
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "app.js"), "console.log('hola')");
  return fn(dir).finally(() => rmSync(dir, { recursive: true, force: true }));
}

async function withServer(
  rootDir: string,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createHttpServer({
    routes: {},
    fallback: createStaticRoute(rootDir),
  });
  const port = await server.listen(0);
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await server.close();
  }
}

test("un fichero real se sirve con su Content-Type", () =>
  withDist(async (dir) => {
    await withServer(dir, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/assets/app.js`);
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("content-type"),
        "text/javascript; charset=utf-8",
      );
      assert.equal(await response.text(), "console.log('hola')");
    });
  }));

test("una ruta sin extensión cae al index.html (fallback de la SPA)", () =>
  withDist(async (dir) => {
    await withServer(dir, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/pet`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /spa/);
    });
  }));

test("un asset con extensión que no existe da 404, no el index.html", () =>
  withDist(async (dir) => {
    await withServer(dir, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/assets/no-existe.js`);
      assert.equal(response.status, 404);
    });
  }));

test("path traversal codificado (%2e%2e) no escapa de la raíz", () =>
  withDist(async (dir) => {
    await withServer(dir, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/%2e%2e%2f%2e%2e%2fetc/passwd`);
      assert.equal(response.status, 404);
    });
  }));

test("con rootDir inexistente, la respuesta dice qué ejecutar", async () => {
  await withServer("/no/existe/dist", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 503);
    assert.match(await response.text(), /pnpm build/);
  });
});
