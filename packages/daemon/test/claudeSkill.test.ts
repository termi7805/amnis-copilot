import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ClaudeSkillStatus } from "@amnis/shared";
import {
  installSkill,
  skillStatus,
} from "../src/infrastructure/claudeSkill.ts";
import { createSkillRoutes } from "../src/infrastructure/http/routes/skill.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amnis-skill-"));
  const source = join(root, "source");
  mkdirSync(join(source, "scripts"), { recursive: true });
  writeFileSync(join(source, "SKILL.md"), "# skill");
  writeFileSync(join(source, "scripts", "a.mjs"), "a");
  const target = join(root, "claude", "skills", "amnis-skin");
  return { root, source, target };
}

test("instalar copia la skill y status pasa de ausente a al día (#160)", () => {
  const { root, source, target } = fixture();
  try {
    assert.deepEqual(skillStatus(source, target), {
      installed: false,
      current: false,
    });
    installSkill(source, target);
    assert.equal(readFileSync(join(target, "scripts", "a.mjs"), "utf8"), "a");
    assert.deepEqual(skillStatus(source, target), {
      installed: true,
      current: true,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("una skill tocada o de otra versión no es la actual; reinstalar la repone sin restos", () => {
  const { root, source, target } = fixture();
  try {
    installSkill(source, target);
    writeFileSync(join(target, "scripts", "a.mjs"), "tocado");
    writeFileSync(join(target, "vieja.md"), "de una versión anterior");
    assert.deepEqual(skillStatus(source, target), {
      installed: true,
      current: false,
    });
    installSkill(source, target);
    assert.equal(existsSync(join(target, "vieja.md")), false);
    assert.equal(skillStatus(source, target).current, true);
    assert.equal(existsSync(`${target}.tmp`), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("instalar no toca otras skills de ~/.claude/skills", () => {
  const { root, source, target } = fixture();
  try {
    const other = join(root, "claude", "skills", "otra");
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, "SKILL.md"), "ajena");
    installSkill(source, target);
    assert.equal(readFileSync(join(other, "SKILL.md"), "utf8"), "ajena");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GET /api/skill informa y POST /api/skill/install instala", async () => {
  let installed = false;
  const server = createHttpServer({
    routes: createSkillRoutes({
      status: () => ({ installed, current: installed }),
      install: () => {
        installed = true;
      },
    }),
  });
  const port = await server.listen(0);
  try {
    const url = `http://127.0.0.1:${port}/api/skill`;
    assert.deepEqual((await (await fetch(url)).json()) as ClaudeSkillStatus, {
      installed: false,
      current: false,
    });
    assert.equal((await fetch(`${url}/install`)).status, 405);
    assert.equal(installed, false);

    const res = await fetch(`${url}/install`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()) as ClaudeSkillStatus, {
      installed: true,
      current: true,
    });
  } finally {
    await server.close();
  }
});
