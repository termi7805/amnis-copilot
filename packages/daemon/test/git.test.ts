import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readCommitHash } from "../src/infrastructure/git.ts";

function withRepo(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "amnis-git-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "bit@amnis.local"], {
      cwd: dir,
    });
    execFileSync("git", ["config", "user.name", "BIT"], { cwd: dir });
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("readCommitHash devuelve el short HEAD real de un repo git", () => {
  withRepo((dir) => {
    writeFileSync(join(dir, "a.txt"), "hola");
    execFileSync("git", ["add", "a.txt"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "primer commit"], {
      cwd: dir,
    });

    const expected = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    }).trim();

    assert.equal(readCommitHash(dir), expected);
  });
});

test("readCommitHash devuelve null en un repo sin commits", () => {
  withRepo((dir) => {
    assert.equal(readCommitHash(dir), null);
  });
});

test("readCommitHash devuelve null fuera de un repo git", () => {
  const dir = mkdtempSync(join(tmpdir(), "amnis-notgit-"));
  try {
    assert.equal(readCommitHash(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
