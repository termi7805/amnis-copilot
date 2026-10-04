import { execFileSync } from "node:child_process";
import { basename, dirname, resolve } from "node:path";

/**
 * `HEAD` corto del repo en `project`. `null` si `project` no es un repo
 * git o si `git` no está disponible — casos reales (el `cwd` lo manda el
 * hook, el daemon no lo controla), no un fallback de sobra.
 */
export function readCommitHash(project: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: project,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      // Desde el sidecar de Windows, sin esto cada hook abre una consola (#133).
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

export interface Checkout {
  /** Raíz del repo: la misma para todos sus worktrees. */
  repoRoot: string;
  /** Raíz del worktree donde está `cwd`. */
  worktree: string;
}

/** Un `cwd` no cambia de repo mientras vive: se resuelve una vez. También se
 * guardan los fallos, para no relanzar `git` en cada `PreToolUse`. */
const checkoutCache = new Map<string, Checkout>();

/** Solo para los tests. */
export function clearCheckoutCache(): void {
  checkoutCache.clear();
}

/**
 * Repo y worktree de `cwd`, con un único `git`. Fuera de un repo, con el
 * directorio ya borrado (un worktree que se cerró) o sin `git`, las dos
 * claves son el propio `cwd`: no se inventa nada.
 */
export function resolveCheckout(cwd: string): Checkout {
  const cached = checkoutCache.get(cwd);
  if (cached) return cached;
  const resolved = readCheckout(cwd) ?? { repoRoot: cwd, worktree: cwd };
  checkoutCache.set(cwd, resolved);
  return resolved;
}

function readCheckout(cwd: string): Checkout | null {
  try {
    const out = execFileSync(
      "git",
      [
        "rev-parse",
        "--path-format=absolute",
        "--git-common-dir",
        "--show-toplevel",
      ],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      },
    );
    const [rawCommonDir, rawWorktree] = out.trim().split("\n");
    if (!rawCommonDir || !rawWorktree) return null;
    // git en Windows responde `C:/x/y` y el hook manda el `cwd` como `C:\x\y`:
    // `resolve` deja las dos rutas con el separador de la plataforma (#133).
    const commonDir = resolve(rawCommonDir);
    const worktree = resolve(rawWorktree);
    // Submódulos (`.git/modules/x`) y repos bare: el padre del common dir no
    // es el repo, así que la raíz es el propio worktree.
    const repoRoot =
      basename(commonDir) === ".git" ? dirname(commonDir) : worktree;
    return { repoRoot, worktree };
  } catch {
    return null;
  }
}
