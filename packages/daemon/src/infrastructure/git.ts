import { execFileSync } from "node:child_process";

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
    }).trim();
  } catch {
    return null;
  }
}
