import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { DEFAULT_SETTINGS } from "@amnis/shared";
import { DB_PATH, SETTINGS_PATH } from "../src/config.ts";
import {
  readSettings,
  writeSettings,
} from "../src/infrastructure/persistence/settings.ts";

function withDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "amnis-settings-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("sin fichero: valores por defecto", () => {
  withDir((dir) => {
    assert.deepEqual(
      readSettings(join(dir, "settings.json")),
      DEFAULT_SETTINGS,
    );
  });
});

test("un settings.json corrupto arranca con los valores por defecto, sin lanzar", () => {
  withDir((dir) => {
    for (const contents of [
      "{ esto no es json",
      "",
      "null",
      "[1,2]",
      "\u0000\u0001",
    ]) {
      const path = join(dir, "settings.json");
      writeFileSync(path, contents);
      assert.deepEqual(
        readSettings(path),
        DEFAULT_SETTINGS,
        JSON.stringify(contents),
      );
    }
  });
});

test("campos sueltos inválidos: solo esos vuelven a su valor por defecto", () => {
  withDir((dir) => {
    const path = join(dir, "settings.json");
    writeFileSync(
      path,
      JSON.stringify({ enabled: false, damping: "x", screen: "text" }),
    );
    const prefs = readSettings(path);
    assert.equal(prefs.enabled, false);
    assert.equal(prefs.screen, "text");
    assert.equal(prefs.damping, DEFAULT_SETTINGS.damping);
  });
});

test("ida y vuelta, y sobrevive a 'reiniciar' (releer del disco)", () => {
  withDir((dir) => {
    const path = join(dir, "settings.json");
    const prefs = {
      ...DEFAULT_SETTINGS,
      enabled: false,
      screenSeconds: 3.5,
      color: "teal" as const,
    };
    writeSettings(prefs, path);
    assert.deepEqual(readSettings(path), prefs);
    assert.deepEqual(readSettings(path), prefs);
  });
});

test("crea el directorio si no existe", () => {
  withDir((dir) => {
    const path = join(dir, "nuevo", "dentro", "settings.json");
    writeSettings(DEFAULT_SETTINGS, path);
    assert.deepEqual(readSettings(path), DEFAULT_SETTINGS);
  });
});

test("escribir no deja temporales y el fichero es JSON válido", () => {
  withDir((dir) => {
    const path = join(dir, "settings.json");
    writeSettings(DEFAULT_SETTINGS, path);
    writeSettings({ ...DEFAULT_SETTINGS, enabled: false }, path);
    assert.deepEqual(readdirSync(dir), ["settings.json"]);
    JSON.parse(readFileSync(path, "utf8"));
  });
});

test("escribir sobre un fichero corrupto lo repara", () => {
  withDir((dir) => {
    const path = join(dir, "settings.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{ roto");
    writeSettings({ ...DEFAULT_SETTINGS, enabled: false }, path);
    assert.equal(readSettings(path).enabled, false);
  });
});

test("las preferencias están fuera de la BD: `ingest --rebuild` solo borra DB_PATH", () => {
  assert.notEqual(SETTINGS_PATH, DB_PATH);
  assert.equal(dirname(SETTINGS_PATH), dirname(DB_PATH));
});

test("un petFocus guardado sobrevive a 'reiniciar' (releer del disco)", () => {
  withDir((dir) => {
    const path = join(dir, "settings.json");
    const petFocus = {
      kind: "session" as const,
      sessionId: "abc",
      worktree: "/home/x/repo-1",
    };
    writeSettings({ ...DEFAULT_SETTINGS, petFocus }, path);
    assert.deepEqual(readSettings(path).petFocus, petFocus);
  });
});

test("un theme guardado sobrevive a 'reiniciar'; uno desconocido cae a system", () => {
  withDir((dir) => {
    const path = join(dir, "settings.json");
    writeSettings({ ...DEFAULT_SETTINGS, theme: "nord" }, path);
    assert.equal(readSettings(path).theme, "nord");
    writeFileSync(path, JSON.stringify({ theme: "sepia" }));
    assert.equal(readSettings(path).theme, "system");
    writeFileSync(path, JSON.stringify({}));
    assert.equal(readSettings(path).theme, "system");
  });
});

test("un locale guardado sobrevive a 'reiniciar'; uno desconocido cae a system", () => {
  withDir((dir) => {
    const path = join(dir, "settings.json");
    writeSettings({ ...DEFAULT_SETTINGS, locale: "en" }, path);
    assert.equal(readSettings(path).locale, "en");
    writeFileSync(path, JSON.stringify({ locale: "fr" }));
    assert.equal(readSettings(path).locale, "system");
    writeFileSync(path, JSON.stringify({}));
    assert.equal(readSettings(path).locale, "system");
  });
});

test("checkUpdates viene activo por defecto y un valor guardado sobrevive", () => {
  withDir((dir) => {
    const path = join(dir, "settings.json");
    writeFileSync(path, JSON.stringify({}));
    assert.equal(readSettings(path).checkUpdates, true);
    writeSettings({ ...DEFAULT_SETTINGS, checkUpdates: false }, path);
    assert.equal(readSettings(path).checkUpdates, false);
    writeFileSync(path, JSON.stringify({ checkUpdates: "no" }));
    assert.equal(readSettings(path).checkUpdates, true);
  });
});

test("un aviso descartado sobrevive a 'reiniciar'", () => {
  withDir((dir) => {
    const path = join(dir, "settings.json");
    writeSettings({ ...DEFAULT_SETTINGS, dismissedUpdate: "0.3.0" }, path);
    assert.equal(readSettings(path).dismissedUpdate, "0.3.0");
  });
});
