import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  clearCheckoutCache,
  readCommitHash,
  resolveCheckout,
} from "../src/infrastructure/git.ts";

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

/** Repo con un commit y un worktree hermano; las rutas salen de `realpath`
 * porque `git` devuelve la ruta real (en /tmp puede haber enlaces). */
function withWorktree(fn: (main: string, wt: string) => void): void {
  withRepo((dir) => {
    const main = realpathSync(dir);
    writeFileSync(join(main, "a.txt"), "hola");
    execFileSync("git", ["add", "a.txt"], { cwd: main });
    execFileSync("git", ["commit", "-q", "-m", "primer commit"], { cwd: main });
    const wt = `${main}-wt`;
    execFileSync("git", ["worktree", "add", "-q", wt, "-b", "rama"], {
      cwd: main,
    });
    try {
      clearCheckoutCache();
      fn(main, wt);
    } finally {
      rmSync(wt, { recursive: true, force: true });
    }
  });
}

test("resolveCheckout: árbol principal y worktree comparten repoRoot y difieren en worktree", () => {
  withWorktree((main, wt) => {
    const a = resolveCheckout(main);
    const b = resolveCheckout(wt);

    assert.equal(a.repoRoot, main);
    assert.equal(b.repoRoot, main);
    assert.equal(a.worktree, main);
    assert.equal(b.worktree, wt);
  });
});

test("resolveCheckout: un subdirectorio da el mismo worktree que su raíz", () => {
  withWorktree((_main, wt) => {
    const sub = join(wt, "packages", "daemon");
    mkdirSync(sub, { recursive: true });

    assert.deepEqual(resolveCheckout(sub), resolveCheckout(wt));
  });
});

test("resolveCheckout: fuera de git o con el directorio borrado, las dos claves son el cwd", () => {
  const dir = mkdtempSync(join(tmpdir(), "amnis-notgit-"));
  try {
    clearCheckoutCache();
    assert.deepEqual(resolveCheckout(dir), { repoRoot: dir, worktree: dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const gone = join(tmpdir(), "amnis-no-existe-106");
  assert.deepEqual(resolveCheckout(gone), { repoRoot: gone, worktree: gone });
});

test("resolveCheckout: cachea por cwd, aunque el repo desaparezca", () => {
  withWorktree((main, wt) => {
    const first = resolveCheckout(wt);
    rmSync(wt, { recursive: true, force: true });

    assert.deepEqual(resolveCheckout(wt), first);
    assert.equal(first.repoRoot, main);
  });
});
