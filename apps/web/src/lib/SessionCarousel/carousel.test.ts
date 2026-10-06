import type { SessionPet } from "@amnis/shared";
import { describe, expect, it } from "vitest";
import { resolvePick, stepPick } from "./carousel.ts";

const s = (id: string, identity = 0): SessionPet => ({
  sessionId: id,
  worktree: `/home/x/${id}`,
  name: id,
  state: "coding",
  since: "2026-01-01T00:00:00Z",
  commitHash: null,
  identity,
});

const [A, B, C, D] = [s("a", 0), s("b", 1), s("c", 2), s("d", 3)];

describe("resolvePick", () => {
  it("sin sesiones no hay nada que ver", () => {
    expect(resolvePick([], null)).toBeNull();
    expect(resolvePick([], { sessionId: "a", index: 0 })).toBeNull();
  });

  it("sin elección, la primera", () => {
    expect(resolvePick([A, B], null)).toEqual({ session: A, index: 0 });
  });

  it("la elegida sigue aunque termine una de delante", () => {
    expect(resolvePick([B, C], { sessionId: "b", index: 1 })).toEqual({
      session: B,
      index: 0,
    });
  });

  it("si sale la que se ve, la que ocupa ahora su puesto", () => {
    expect(resolvePick([A, C, D], { sessionId: "b", index: 1 })).toEqual({
      session: C,
      index: 1,
    });
  });

  it("si sale la última que se ve, la nueva última; nunca la primera", () => {
    expect(resolvePick([A, B], { sessionId: "c", index: 2 })).toEqual({
      session: B,
      index: 1,
    });
  });

  it("una sesión nueva entra al final y no mueve la vista", () => {
    expect(resolvePick([A, B, C], { sessionId: "b", index: 1 })).toEqual({
      session: B,
      index: 1,
    });
  });
});

describe("stepPick", () => {
  it("→ recorre en orden y vuelve a la primera", () => {
    const list = [A, B, C];
    let pick = stepPick(list, resolvePick(list, null), 1);
    expect(pick?.sessionId).toBe("b");
    pick = stepPick(list, resolvePick(list, pick), 1);
    expect(pick?.sessionId).toBe("c");
    pick = stepPick(list, resolvePick(list, pick), 1);
    expect(pick?.sessionId).toBe("a");
  });

  it("← desde la primera va a la última", () => {
    const list = [A, B, C];
    expect(stepPick(list, resolvePick(list, null), -1)).toEqual({
      sessionId: "c",
      index: 2,
    });
  });
});
