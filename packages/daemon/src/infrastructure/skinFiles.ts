import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { skinPathProblem } from "@amnis/shared";
import type { SkinFolder } from "../application/skins.ts";

const SKIN_ID_RE = /^[A-Za-z0-9._-]+$/;

export const isSkinId = (id: string): boolean =>
  SKIN_ID_RE.test(id) && id !== "." && id !== "..";

/** Carpetas de `root` con nombre admisible; sin `root`, ninguna. */
export function skinIds(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter(
        (e) => isSkinId(e.name) && statSync(join(root, e.name)).isDirectory(),
      )
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Único punto contra el path traversal: la ruta tiene que ser válida como
 * ruta de manifest y, ya resuelta con los enlaces simbólicos, caer dentro de
 * la carpeta de la skin y ser un fichero. `null` ante cualquier otra cosa.
 */
export function resolveInside(dir: string, relPath: string): string | null {
  if (skinPathProblem(relPath) !== null) return null;
  try {
    const root = realpathSync(dir);
    const target = realpathSync(join(root, ...relPath.split("/")));
    if (!target.startsWith(root + sep) || !statSync(target).isFile()) {
      return null;
    }
    return target;
  } catch {
    return null;
  }
}

export function skinFolder(dir: string): SkinFolder {
  return {
    readManifest: () => {
      try {
        return readFileSync(join(dir, "skin.json"), "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    hasImage: (src) => resolveInside(dir, src) !== null,
  };
}
