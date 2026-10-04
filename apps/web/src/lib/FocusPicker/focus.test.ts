import type { PetFocus } from "@amnis/shared";
import { describe, expect, it } from "vitest";
import { focusLabel, sameFocus } from "./focus.ts";

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
