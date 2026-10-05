import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { ClaudeSkillStatus } from "@amnis/shared";

/**
 * La skill `amnis-skin` (#160) viaja con Amnis y se copia a Claude Code solo
 * cuando el usuario pulsa el botón del dashboard: Amnis no escribe en
 * `~/.claude/` por su cuenta más allá de los hooks.
 */

function filesIn(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? filesIn(join(dir, e.name), `${prefix}${e.name}/`)
      : [`${prefix}${e.name}`],
  );
}

/** Mismos ficheros con el mismo contenido: una skin tocada a mano no es la actual. */
function sameTree(a: string, b: string): boolean {
  const left = filesIn(a).sort();
  const right = filesIn(b).sort();
  if (left.join("\n") !== right.join("\n")) return false;
  return left.every((f) =>
    readFileSync(join(a, f)).equals(readFileSync(join(b, f))),
  );
}

export function skillStatus(source: string, target: string): ClaudeSkillStatus {
  if (!existsSync(target)) return { installed: false, current: false };
  return { installed: true, current: sameTree(source, target) };
}

/** Reemplaza solo la carpeta de la skill; el resto de `~/.claude/skills/` no se toca. */
export function installSkill(source: string, target: string): void {
  mkdirSync(dirname(target), { recursive: true });
  const staging = `${target}.tmp`;
  rmSync(staging, { recursive: true, force: true });
  cpSync(source, staging, { recursive: true });
  rmSync(target, { recursive: true, force: true });
  renameSync(staging, target);
}
