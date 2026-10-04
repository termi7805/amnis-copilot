import { DEFAULT_SETTINGS, type StateResponse } from "@amnis/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { fatigueLabel, PetHero } from "./PetHero.tsx";

const state = {
  pet: {
    state: "coding",
    since: "2026-01-01T00:00:00Z",
    fatigue: 0.34,
    level: 1,
    reason: "test",
    commitHash: null,
    project: "amnis-copilot",
    listening: null,
    focus: { kind: "auto" },
  },
  quotas: [],
  settings: DEFAULT_SETTINGS,
} as unknown as StateResponse;

afterEach(cleanup);

describe("PetHero", () => {
  it("enseña estado, desde cuándo, proyecto y fatiga", () => {
    render(<PetHero state={state} now={new Date("2026-01-01T00:04:00Z")} />);
    expect(screen.getAllByText("Escribiendo código").length).toBeGreaterThan(0);
    expect(screen.getByText("desde hace 4 min")).toBeVisible();
    expect(screen.getByText("amnis-copilot")).toBeVisible();
    expect(screen.getByText(/34 % ·/)).toBeVisible();
    expect(screen.getByTestId("pet-stage")).toBeInTheDocument();
  });

  it("el selector de foco enseña a qué mira la mascota", () => {
    render(
      <PetHero
        state={{
          ...state,
          pet: {
            ...state.pet,
            focus: { kind: "worktree", worktree: "/home/x/repo-1" },
          },
        }}
        now={new Date("2026-01-01T00:04:00Z")}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Foco de la mascota" }),
    ).toHaveTextContent("repo-1");
  });

  it("el chip de música solo aparece si suena algo", () => {
    const listening = {
      vibe: "chill",
      bpm: 96,
      track: { id: "t", title: "x", artist: "y", imageUrl: null },
    } as const;
    const { rerender } = render(
      <PetHero state={state} now={new Date("2026-01-01T00:04:00Z")} />,
    );
    expect(screen.queryByText(/con cascos/)).toBeNull();
    rerender(
      <PetHero
        state={{ ...state, pet: { ...state.pet, listening } }}
        now={new Date("2026-01-01T00:04:00Z")}
      />,
    );
    expect(screen.getByText("con cascos · chill 96 BPM")).toBeVisible();
  });

  it("fatigueLabel sigue la curva de la mascota", () => {
    expect(fatigueLabel(0.05)).toBe("fresca");
    expect(fatigueLabel(0.5)).toBe("cansada");
    expect(fatigueLabel(0.9)).toBe("agotada");
  });
});
