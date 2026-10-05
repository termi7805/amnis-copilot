import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { SkinsSnapshot } from "@amnis/shared";
import { startSkinCatalog } from "../src/infrastructure/skinCatalog.ts";

const PNG = Buffer.from("89504e470d0a1a0a", "hex");

function writeSkin(root: string, id: string): void {
  mkdirSync(join(root, id), { recursive: true });
  writeFileSync(
    join(root, id, "skin.json"),
    JSON.stringify({
      name: id,
      states: { coding: { layers: [{ src: "body.png" }] } },
    }),
  );
  writeFileSync(join(root, id, "body.png"), PNG);
}

function waitFor(
  seen: SkinsSnapshot[],
  ok: (s: SkinsSnapshot) => boolean,
): Promise<SkinsSnapshot> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const hit = seen.find(ok);
      if (hit) resolve(hit);
      else if (Date.now() - started > 5000) reject(new Error("sin cambio"));
      else setTimeout(tick, 25);
    };
    tick();
  });
}

test("lee las skins al arrancar y no avisa", () => {
  const root = mkdtempSync(join(tmpdir(), "amnis-catalog-"));
  writeSkin(root, "uno");
  const seen: SkinsSnapshot[] = [];
  const catalog = startSkinCatalog({ root, onChange: (s) => seen.push(s) });
  try {
    assert.deepEqual(
      catalog.snapshot().skins.map((s) => s.id),
      ["uno"],
    );
    assert.deepEqual(seen, []);
  } finally {
    catalog.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("avisa cuando se borra o se rompe una skin, con rev nuevo", async () => {
  const root = mkdtempSync(join(tmpdir(), "amnis-catalog-"));
  writeSkin(root, "uno");
  const seen: SkinsSnapshot[] = [];
  const catalog = startSkinCatalog({
    root,
    onChange: (s) => seen.push(s),
    debounceMs: 20,
  });
  try {
    const before = catalog.snapshot().rev;
    unlinkSync(join(root, "uno", "body.png"));
    const broken = await waitFor(seen, (s) => s.skins[0]?.errors.length === 1);
    assert.ok(broken.rev > before);

    rmSync(join(root, "uno"), { recursive: true, force: true });
    const gone = await waitFor(seen, (s) => s.skins.length === 0);
    assert.ok(gone.rev > broken.rev);
    assert.equal(catalog.snapshot().rev, seen.at(-1)?.rev);
  } finally {
    catalog.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("reload sin carpeta al arrancar la encuentra después", async () => {
  const base = mkdtempSync(join(tmpdir(), "amnis-catalog-"));
  const root = join(base, "skins");
  const seen: SkinsSnapshot[] = [];
  const catalog = startSkinCatalog({
    root,
    onChange: (s) => seen.push(s),
    debounceMs: 20,
  });
  try {
    assert.deepEqual(catalog.snapshot().skins, []);
    writeSkin(root, "uno");
    const reloaded = catalog.reload();
    assert.deepEqual(
      reloaded.skins.map((s) => s.id),
      ["uno"],
    );
    assert.equal(seen.length, 1);

    // Ya vigilada: el siguiente cambio llega solo.
    writeSkin(root, "dos");
    await waitFor(seen, (s) => s.skins.length === 2);
  } finally {
    catalog.stop();
    rmSync(base, { recursive: true, force: true });
  }
});
