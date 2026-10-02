import type { PetSnapshot, QuotaSnapshot } from "@amnis/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuotaPanel } from "./QuotaPanel.tsx";

const NOW = new Date("2026-01-01T00:00:00Z");

const basePet: PetSnapshot = {
  state: "coding",
  since: new Date(NOW.getTime() - 12 * 60_000).toISOString(),
  fatigue: 0.3,
  level: 1,
  reason: "test",
  commitHash: null,
  listening: null,
};

const baseQuota: QuotaSnapshot = {
  provider: "anthropic",
  authoritative: {
    fiveHour: {
      utilization: 62,
      resetsAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
    },
    sevenDay: { utilization: 41, resetsAt: null },
    limits: [],
  },
  local: {
    fiveHourTokens: 100,
    fiveHourUtilization: 62,
    windowStartedAt: "2026-01-01T00:00:00Z",
  },
  divergence: 0,
  sampledAt: "2026-01-01T00:00:00Z",
  error: null,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response("{}"))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("QuotaPanel", () => {
  it("la fila de actividad muestra el estado y hace cuánto lleva en él", () => {
    render(
      <QuotaPanel
        pet={basePet}
        status="connected"
        quotas={[baseQuota]}
        now={NOW}
      />,
    );

    expect(screen.getByTestId("activity-label")).toHaveTextContent(
      "Escribiendo código",
    );
    expect(screen.getByTestId("activity-duration")).toHaveTextContent("12 min");
    expect(screen.getByText("AMNIS")).toBeInTheDocument();
    expect(screen.getAllByTestId("quota-value")).toHaveLength(2);
  });

  it("se ve qué IA es — la etiqueta del proveedor siempre está, no solo con varios", () => {
    render(
      <QuotaPanel
        pet={basePet}
        status="connected"
        quotas={[baseQuota]}
        now={NOW}
      />,
    );

    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("con más de un proveedor, cada uno lleva su etiqueta", () => {
    const other: QuotaSnapshot = {
      ...baseQuota,
      provider: "anthropic",
    };
    render(
      <QuotaPanel
        pet={basePet}
        status="connected"
        quotas={[baseQuota, other]}
        now={NOW}
      />,
    );

    expect(screen.getAllByText("Claude")).toHaveLength(2);
  });

  it("sin endpoint OAuth, se lee 'sin dato', no un 0%", () => {
    const quota: QuotaSnapshot = {
      ...baseQuota,
      authoritative: null,
    };
    render(
      <QuotaPanel
        pet={basePet}
        status="connected"
        quotas={[quota]}
        now={NOW}
      />,
    );

    const values = screen.getAllByTestId("quota-value");
    expect(values[0]).toHaveTextContent("~62%");
    expect(values[1]).toHaveTextContent("sin dato");
  });

  it("un error del sampleo se ve, no desaparece detrás de un anillo vacío", () => {
    const quota: QuotaSnapshot = { ...baseQuota, error: "endpoint caído" };
    render(
      <QuotaPanel
        pet={basePet}
        status="connected"
        quotas={[quota]}
        now={NOW}
      />,
    );

    expect(screen.getByText("endpoint caído")).toBeInTheDocument();
  });

  it("con un límite con scope, aparece un tercer anillo", () => {
    const authoritative = baseQuota.authoritative;
    if (!authoritative) throw new Error("baseQuota.authoritative no existe");
    const quota: QuotaSnapshot = {
      ...baseQuota,
      authoritative: {
        ...authoritative,
        limits: [
          {
            kind: "weekly_model",
            group: "weekly",
            scope: "opus",
            utilization: 12,
            resetsAt: null,
            severity: "normal",
            isActive: true,
            label: "weekly_model · opus",
          },
        ],
      },
    };
    render(
      <QuotaPanel
        pet={basePet}
        status="connected"
        quotas={[quota]}
        now={NOW}
      />,
    );

    expect(screen.getAllByTestId("quota-value")).toHaveLength(3);
  });

  it("con status offline, pinta la escena de 'sin conexión'", () => {
    const { container } = render(
      <QuotaPanel
        pet={basePet}
        status="offline"
        quotas={[baseQuota]}
        now={NOW}
      />,
    );

    expect(
      container.querySelector("[data-look]")?.getAttribute("data-look"),
    ).toBe("offline");
  });

  it("el botón de recarga llama a POST /api/quota/refresh y gira mientras espera", () => {
    render(
      <QuotaPanel
        pet={basePet}
        status="connected"
        quotas={[baseQuota]}
        now={NOW}
      />,
    );

    const button = screen.getByRole("button", { name: "Recargar cuota" });
    expect(button).toHaveAttribute("data-refreshing", "false");

    fireEvent.click(button);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/quota/refresh"),
      { method: "POST" },
    );
    expect(button).toHaveAttribute("data-refreshing", "true");
    expect(button).toBeDisabled();
  });

  it("al llegar una cuota fresca, el botón deja de girar", () => {
    const { rerender } = render(
      <QuotaPanel
        pet={basePet}
        status="connected"
        quotas={[baseQuota]}
        now={NOW}
      />,
    );

    const button = screen.getByRole("button", { name: "Recargar cuota" });
    fireEvent.click(button);
    expect(button).toHaveAttribute("data-refreshing", "true");

    rerender(
      <QuotaPanel
        pet={basePet}
        status="connected"
        quotas={[{ ...baseQuota, sampledAt: "2026-01-01T00:05:00Z" }]}
        now={NOW}
      />,
    );

    expect(button).toHaveAttribute("data-refreshing", "false");
  });
});
