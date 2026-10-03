import {
  DEFAULT_SETTINGS,
  type PlanInfo,
  type StateResponse,
} from "@amnis/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanCard } from "./PlanCard.tsx";

afterEach(cleanup);

function stateWith(plan: PlanInfo | null, manual: string | null = null) {
  return {
    plan,
    settings: { ...DEFAULT_SETTINGS, plan: manual },
  } as StateResponse;
}

describe("PlanCard", () => {
  it("con plan detectado es un dato de solo lectura marcado «automático»", () => {
    render(
      <PlanCard
        state={stateWith({
          id: "pro",
          label: "Pro",
          monthlyUsd: 20,
          source: "detected",
        })}
      />,
    );
    expect(screen.getByText("Claude Pro")).toBeVisible();
    expect(screen.getByText("automático")).toBeVisible();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("sin plan detectado ofrece el selector y guarda la elección", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    render(<PlanCard state={stateWith(null)} save={save} />);

    expect(screen.queryByText("automático")).toBeNull();
    fireEvent.change(screen.getByLabelText("Tu suscripción"), {
      target: { value: "max_5x" },
    });
    expect(save).toHaveBeenCalledExactlyOnceWith({ plan: "max_5x" });
  });

  it("volver a «Elige tu plan…» guarda null", () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    render(
      <PlanCard
        state={stateWith(
          { id: "pro", label: "Pro", monthlyUsd: 20, source: "manual" },
          "pro",
        )}
        save={save}
      />,
    );
    fireEvent.change(screen.getByLabelText("Tu suscripción"), {
      target: { value: "" },
    });
    expect(save).toHaveBeenCalledExactlyOnceWith({ plan: null });
  });

  it("un error del daemon se enseña", async () => {
    const save = vi
      .fn()
      .mockResolvedValue({ ok: false, message: "Plan inválido" });
    render(<PlanCard state={stateWith(null)} save={save} />);
    fireEvent.change(screen.getByLabelText("Tu suscripción"), {
      target: { value: "pro" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Plan inválido");
  });
});
