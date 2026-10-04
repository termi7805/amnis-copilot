import type { PetFocus, SessionsResponse } from "@amnis/shared";

/** Último tramo de una ruta: igual que `projectName` en el daemon. */
function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

/** Los dos focos señalan lo mismo (el `PetFocus` guardado es canónico). */
export function sameFocus(a: PetFocus, b: PetFocus): boolean {
  switch (a.kind) {
    case "auto":
      return b.kind === "auto";
    case "repo":
      return b.kind === "repo" && a.repoRoot === b.repoRoot;
    case "worktree":
      return b.kind === "worktree" && a.worktree === b.worktree;
    case "session":
      return b.kind === "session" && a.sessionId === b.sessionId;
  }
}

/**
 * Lo que se enseña en el botón. El foco solo guarda rutas, así que el nombre
 * sale del último tramo; de una sesión se enseña su worktree y un id corto.
 */
export function focusLabel(focus: PetFocus): string {
  switch (focus.kind) {
    case "auto":
      return "Automático";
    case "repo":
      return baseName(focus.repoRoot);
    case "worktree":
      return baseName(focus.worktree);
    case "session":
      return `${baseName(focus.worktree)} · ${focus.sessionId.slice(0, 6)}`;
  }
}

/**
 * Quita las sesiones terminadas. Deja repos y worktrees aunque se queden sin
 * sesiones: enfocar uno antes de abrir una sesión en él es válido.
 */
export function hideEnded(sessions: SessionsResponse): SessionsResponse {
  return {
    repos: sessions.repos.map((repo) => ({
      ...repo,
      worktrees: repo.worktrees.map((wt) => ({
        ...wt,
        sessions: wt.sessions.filter((s) => s.alive),
      })),
    })),
  };
}
