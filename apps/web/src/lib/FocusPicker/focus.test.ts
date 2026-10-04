import type { PetFocus, SessionsResponse } from "@amnis/shared";
import { describe, expect, it } from "vitest";
import { focusLabel, hideEnded, sameFocus } from "./focus.ts";

const session: PetFocus = {
  kind: "session",
  sessionId: "abcdef123",
  worktree: "/home/x/repo-1",
};

describe("focusLabel", () => {
  it("nombra cada tipo de foco", () => {
    expect(focusLabel({ kind: "auto" })).toBe("Automático");
    expect(focusLabel({ kind: "repo", repoRoot: "/home/x/repo" })).toBe("repo");
    expect(focusLabel({ kind: "worktree", worktree: "/home/x/repo-1/" })).toBe(
      "repo-1",
    );
    expect(focusLabel(session)).toBe("repo-1 · abcdef");
  });
});

describe("sameFocus", () => {
  it("compara por el identificador de cada tipo", () => {
    expect(sameFocus({ kind: "auto" }, { kind: "auto" })).toBe(true);
    expect(
      sameFocus(
        { kind: "worktree", worktree: "/a" },
        { kind: "worktree", worktree: "/a" },
      ),
    ).toBe(true);
    expect(sameFocus(session, { ...session, worktree: "/otro" })).toBe(true);
  });

  it("distintos tipos o identificadores no coinciden", () => {
    expect(
      sameFocus(
        { kind: "repo", repoRoot: "/a" },
        { kind: "worktree", worktree: "/a" },
      ),
    ).toBe(false);
    expect(
      sameFocus(
        { kind: "worktree", worktree: "/a" },
        { kind: "worktree", worktree: "/b" },
      ),
    ).toBe(false);
    expect(sameFocus(session, { kind: "auto" })).toBe(false);
  });
});

describe("hideEnded", () => {
  const at = "2026-01-10T11:00:00Z";
  const make = (sessionId: string, alive: boolean) => ({
    sessionId,
    state: "sleeping" as const,
    lastEventAt: at,
    startedAt: at,
    alive,
  });
  const sessions: SessionsResponse = {
    repos: [
      {
        repoRoot: "/r",
        name: "r",
        worktrees: [
          {
            worktree: "/r-1",
            name: "r-1",
            branch: null,
            sessions: [make("viva", true), make("muerta", false)],
          },
          {
            worktree: "/r-2",
            name: "r-2",
            branch: null,
            sessions: [make("otra-muerta", false)],
          },
        ],
      },
    ],
  };

  it("quita las terminadas y deja las vivas", () => {
    const wt = hideEnded(sessions).repos[0]?.worktrees[0];
    expect(wt?.sessions.map((s) => s.sessionId)).toEqual(["viva"]);
  });

  it("deja el repo y el worktree aunque se queden sin sesiones", () => {
    const repo = hideEnded(sessions).repos[0];
    expect(repo?.worktrees.map((w) => w.worktree)).toEqual(["/r-1", "/r-2"]);
    expect(repo?.worktrees[1]?.sessions).toEqual([]);
  });

  it("no muta la respuesta original", () => {
    hideEnded(sessions);
    expect(sessions.repos[0]?.worktrees[0]?.sessions).toHaveLength(2);
  });
});
