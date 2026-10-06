import { msg, type PetSnapshot, type QuotaSnapshot } from "@amnis/shared";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n/index.ts";
import { QuotaPanel } from "./QuotaPanel.tsx";

const NOW = new Date("2026-01-01T00:00:00Z");

const basePet: PetSnapshot = {
  state: "coding",
  since: new Date(NOW.getTime() - 12 * 60_000).toISOString(),
  fatigue: 0.3,
  level: 1,
  reason: "test",
  commitHash: null,
  project: null,
  listening: null,
  focus: { kind: "auto" },
  othersActive: 0,
  sessions: null,
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
    weeklyBreakdown: null,
  },
  local: {
    fiveHourTokens: 100,
    fiveHourUtilization: 62,
    windowStartedAt: "2026-01-01T00:00:00Z",
    calibrated: true,
    ceilingWindows: 3,
    provisionalUtilization: null,
  },
  divergence: 0,
  projection: { fiveHourAtReset: null, fiveHourExhaustsAt: null },
  sampledAt: "2026-01-01T00:00:00Z",
  error: null,
  rateLimitedAt: null,
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
    const quota: QuotaSnapshot = {
      ...baseQuota,
      error: msg("raw", { text: "endpoint caído" }),
    };
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

  const withLimit = (
    limit: Partial<NonNullable<QuotaSnapshot["authoritative"]>["limits"][0]>,
  ): QuotaSnapshot => {
    const authoritative = baseQuota.authoritative;
    if (!authoritative) throw new Error("baseQuota.authoritative no existe");
    return {
      ...baseQuota,
      authoritative: {
        ...authoritative,
        limits: [
          {
            // Lo que entrega el daemon con la forma de octubre de 2026: el
            // nombre ya sale del display_name del scope objeto.
            kind: "weekly_scoped",
            group: "weekly",
            scope: "Fable",
            utilization: 7,
            resetsAt: null,
            severity: "normal",
            isActive: true,
            label: "7d · Fable",
            ...limit,
          },
        ],
      },
    };
  };

  it("el límite de Fable se lee traducido, sin el kind crudo de la API", async () => {
    const quota = withLimit({});
    const { container } = render(
      <QuotaPanel
        pet={basePet}
        status="connected"
        quotas={[quota]}
        now={NOW}
      />,
    );

    expect(screen.getByText("7d · Fable")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/weekly_|_/);

    await act(async () => {
      await i18n.changeLanguage("en");
    });
    expect(screen.getByText("7d · Fable")).toBeInTheDocument();
    await act(async () => {
      await i18n.changeLanguage("es");
    });
  });

  it("un límite sin scope no enseña su kind", () => {
    const quota = withLimit({
      kind: "weekly_oauth_apps",
      scope: null,
      label: "weekly_oauth_apps",
    });
    const { container } = render(
      <QuotaPanel
        pet={basePet}
        status="connected"
        quotas={[quota]}
        now={NOW}
      />,
    );

    expect(screen.getByText("Otro límite")).toBeInTheDocument();
    expect(container.textContent).not.toContain("weekly_oauth_apps");
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

  it("con 429 deja de girar, avisa y el dato anterior se queda con su antigüedad (#116)", async () => {
    const aviso =
      "Anthropic está limitando las consultas, prueba en unos minutos.";
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: aviso }), { status: 429 }),
        ),
      ),
    );
    render(
      <QuotaPanel
        pet={basePet}
        status="connected"
        quotas={[
          {
            ...baseQuota,
            sampledAt: "2025-12-31T23:50:00Z",
            error: msg("raw", { text: "El endpoint de cuota respondió 429." }),
            rateLimitedAt: "2026-01-01T00:00:00Z",
          },
        ]}
        now={NOW}
      />,
    );
    const button = screen.getByRole("button", { name: "Recargar cuota" });

    fireEvent.click(button);

    expect(await screen.findByText(aviso)).toBeInTheDocument();
    expect(button).toHaveAttribute("data-refreshing", "false");
    expect(screen.getByText("Dato de hace 10 min")).toBeInTheDocument();
  });

  describe("hora de agotarse (#119)", () => {
    const conProjection = (projection: QuotaSnapshot["projection"]) => (
      <QuotaPanel
        pet={basePet}
        status="connected"
        quotas={[{ ...baseQuota, projection }]}
        now={NOW}
      />
    );

    it("se agota antes del reset: enseña la hora", () => {
      render(
        conProjection({
          fiveHourAtReset: 130,
          fiveHourExhaustsAt: new Date(
            NOW.getTime() + 30 * 60_000,
          ).toISOString(),
        }),
      );
      expect(screen.getByTestId("exhausts")).toHaveTextContent("Se agota");
      expect(screen.getByTestId("exhausts")).toHaveTextContent("en 30m");
    });

    it.each([
      [
        "después del reset",
        { fiveHourAtReset: 90, fiveHourExhaustsAt: "2026-01-01T09:00:00Z" },
      ],
      ["ritmo 0", { fiveHourAtReset: 62, fiveHourExhaustsAt: null }],
      [
        "sin ritmo medible",
        { fiveHourAtReset: null, fiveHourExhaustsAt: null },
      ],
    ])("%s: no enseña hora", (_caso, projection) => {
      render(conProjection(projection));
      expect(screen.queryByTestId("exhausts")).toBeNull();
    });
  });
});
