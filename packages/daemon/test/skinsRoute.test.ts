import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { SkinSummary } from "@amnis/shared";
import { createSkinsRoutes } from "../src/infrastructure/http/routes/skins.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";

const PNG = Buffer.from("89504e470d0a1a0a", "hex");

/** `root` hace de AMNIS_DIR: el `settings.json` es lo que no debe salir. */
async function withSkins(
  fn: (ctx: { port: number; root: string }) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "amnis-skins-"));
  const skins = join(root, "skins");
  writeFileSync(join(root, "settings.json"), '{"secreto":true}');
  mkdirSync(join(skins, "buena", "coding"), { recursive: true });
  writeFileSync(
    join(skins, "buena", "skin.json"),
    JSON.stringify({
      name: "Buena",
      states: { coding: { layers: [{ src: "coding/body.png" }] } },
    }),
  );
  writeFileSync(join(skins, "buena", "coding", "body.png"), PNG);
  writeFileSync(join(skins, "buena", "logo.svg"), "<svg/>");
  mkdirSync(join(skins, "rota"));
  writeFileSync(
    join(skins, "rota", "skin.json"),
    JSON.stringify({ states: { coding: { layers: [{ src: "falta.png" }] } } }),
  );
  const server = createHttpServer({ routes: createSkinsRoutes(skins) });
  const port = await server.listen(0);
  try {
    await fn({ port, root });
  } finally {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
}

/** `fetch` normaliza la URL; `http.request` manda el path tal cual. */
function get(
  port: number,
  path: string,
): Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, path }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        }),
      );
    })
      .on("error", reject)
      .end();
  });
}

test("lista una skin buena y una rota con su error", () =>
  withSkins(async ({ port }) => {
    const r = await get(port, "/api/skins");
    assert.equal(r.status, 200);
    const skins = JSON.parse(r.body.toString()) as SkinSummary[];
    assert.deepEqual(
      skins.map((s) => s.id),
      ["buena", "rota"],
    );
    assert.deepEqual(skins[0]?.errors, []);
    assert.deepEqual(skins[0]?.states, ["coding"]);
    assert.match(skins[1]?.errors[0] ?? "", /falta\.png/);
  }));

test("sirve una imagen con su MIME y sin sniffing", () =>
  withSkins(async ({ port }) => {
    const r = await get(port, "/api/skins/buena/coding/body.png");
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-type"], "image/png");
    assert.equal(r.headers["x-content-type-options"], "nosniff");
    assert.deepEqual(r.body, PNG);
  }));

test("un SVG sale con una CSP que impide ejecutar scripts", () =>
  withSkins(async ({ port }) => {
    const r = await get(port, "/api/skins/buena/logo.svg");
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-type"], "image/svg+xml");
    assert.match(String(r.headers["content-security-policy"]), /sandbox/);
  }));

test("ninguna forma de salir de la carpeta devuelve el fichero", () =>
  withSkins(async ({ port }) => {
    const attempts = [
      "/api/skins/x/../../settings.json",
      "/api/skins/buena/../../settings.json",
      "/api/skins/buena/%2e%2e/%2e%2e/settings.json",
      "/api/skins/buena/..%2f..%2fsettings.json",
      "/api/skins/buena/..%5c..%5csettings.json",
      "/api/skins/%2e%2e/settings.json",
      "/api/skins/buena/skin.json",
      "/api/skins/buena/coding",
      "/api/skins/buena",
      "/api/skins/buena/%00.png",
      "/api/skins/buena/%zz",
    ];
    for (const path of attempts) {
      const r = await get(port, path);
      assert.equal(r.status, 404, path);
      assert.doesNotMatch(r.body.toString(), /secreto/, path);
    }
  }));

test("un enlace simbólico que sale de la carpeta no se sirve", (t) =>
  withSkins(async ({ port, root }) => {
    try {
      symlinkSync(
        join(root, "settings.json"),
        join(root, "skins", "buena", "fuga.png"),
      );
    } catch {
      t.skip("este sistema no deja crear enlaces simbólicos");
      return;
    }
    const r = await get(port, "/api/skins/buena/fuga.png");
    assert.equal(r.status, 404);
    assert.doesNotMatch(r.body.toString(), /secreto/);
  }));
