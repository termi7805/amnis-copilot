import type {
  PetState,
  RepoSummary,
  SessionSummary,
  SessionsResponse,
  WorktreeSummary,
} from "@amnis/shared";
import { sleepAfter } from "../domain/petState.ts";
import { projectName } from "./getState.ts";

/** Cuánto tiempo se lista una sesión terminada. */
export const SESSION_LIST_WINDOW_MS = 24 * 60 * 60_000;

export interface ListSessionsDeps {
  recentSessions(since: Date): {
    sessionId: string;
    startedAt: string;
    lastEventAt: string;
    ended: boolean;
    repoRoot: string;
    worktree: string;
    lastState: string | null;
  }[];
  /** Rama de git por `session_id` en el rango (del uso, no de `git`). */
  branchBySession(from: Date, to: Date): Map<string, string>;
}

const byRecent = <T extends { lastEventAt: string }>(a: T, b: T): number =>
  b.lastEventAt.localeCompare(a.lastEventAt);

/**
 * Agrupa las sesiones recientes en repo → worktree → sesión. Viva exige las
 * dos cosas: sin `SessionEnd` y con hooks dentro de la ventana de
 * inactividad, porque un terminal matado con `kill` nunca manda `SessionEnd`.
 */
export function listSessions(
  deps: ListSessionsDeps,
  now: Date,
): SessionsResponse {
  const since = new Date(now.getTime() - SESSION_LIST_WINDOW_MS);
  const branches = deps.branchBySession(since, now);
  const rows = deps.recentSessions(since);

  type Entry = SessionSummary & { branch: string | null };
  const worktrees = new Map<
    string,
    { repoRoot: string; worktree: string; sessions: Entry[] }
  >();
  for (const r of rows) {
    const alive = !r.ended && !sleepAfter(new Date(r.lastEventAt), now);
    const state: PetState = alive
      ? ((r.lastState as PetState | null) ?? "resting")
      : "sleeping";
    const key = `${r.repoRoot}\0${r.worktree}`;
    const group = worktrees.get(key) ?? {
      repoRoot: r.repoRoot,
      worktree: r.worktree,
      sessions: [],
    };
    group.sessions.push({
      sessionId: r.sessionId,
      state,
      lastEventAt: r.lastEventAt,
      startedAt: r.startedAt,
      alive,
      branch: branches.get(r.sessionId) ?? null,
    });
    worktrees.set(key, group);
  }

  const repos = new Map<string, RepoSummary>();
  for (const group of worktrees.values()) {
    const sessions = group.sessions.sort(byRecent);
    const summary: WorktreeSummary = {
      worktree: group.worktree,
      name: projectName(group.worktree) ?? group.worktree,
      branch: sessions.find((s) => s.branch)?.branch ?? null,
      sessions: sessions.map(({ branch: _branch, ...s }) => s),
    };
    const repo = repos.get(group.repoRoot) ?? {
      repoRoot: group.repoRoot,
      name: projectName(group.repoRoot) ?? group.repoRoot,
      worktrees: [],
    };
    repo.worktrees.push(summary);
    repos.set(group.repoRoot, repo);
  }

  const latest = (w: WorktreeSummary): string =>
    w.sessions[0]?.lastEventAt ?? "";
  const list = [...repos.values()];
  for (const repo of list) {
    repo.worktrees.sort((a, b) => latest(b).localeCompare(latest(a)));
  }
  list.sort((a, b) =>
    latest(b.worktrees[0] as WorktreeSummary).localeCompare(
      latest(a.worktrees[0] as WorktreeSummary),
    ),
  );
  return { repos: list };
}
