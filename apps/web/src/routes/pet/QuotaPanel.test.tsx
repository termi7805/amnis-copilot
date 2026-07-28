import type { QuotaSnapshot } from "@amnis/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QuotaPanel } from "./QuotaPanel.tsx";

const NOW = new Date("2026-01-01T00:00:00Z");

const baseQuota: QuotaSnapshot = {
  provider: "anthropic",
  authoritative: {
    fiveHour: {
      utilization: 62,
      resetsAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
    },
    sevenDay: { utilization: 41, resetsAt: null },
    sevenDayOpus: null,
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

afterEach(cleanup);

describe("QuotaPanel", () => {
  it("una sección por proveedor, con su etiqueta legible", () => {
    render(<QuotaPanel quotas={[baseQuota]} now={NOW} />);

    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getAllByTestId("quota-value")).toHaveLength(2);
  });

  it("sin endpoint OAuth, se lee 'sin dato', no un 0%", () => {
    const quota: QuotaSnapshot = {
      ...baseQuota,
      authoritative: null,
    };
    render(<QuotaPanel quotas={[quota]} now={NOW} />);

    const values = screen.getAllByTestId("quota-value");
    expect(values[0]).toHaveTextContent("~62%");
    expect(values[1]).toHaveTextContent("sin dato");
  });

  it("un error del sampleo se ve, no desaparece detrás de un anillo vacío", () => {
    const quota: QuotaSnapshot = { ...baseQuota, error: "endpoint caído" };
    render(<QuotaPanel quotas={[quota]} now={NOW} />);

    expect(screen.getByText("endpoint caído")).toBeInTheDocument();
  });

  it("con 7d Opus, aparece un tercer anillo", () => {
    const authoritative = baseQuota.authoritative;
    if (!authoritative) throw new Error("baseQuota.authoritative no existe");
    const quota: QuotaSnapshot = {
      ...baseQuota,
      authoritative: {
        ...authoritative,
        sevenDayOpus: { utilization: 12, resetsAt: null },
      },
    };
    render(<QuotaPanel quotas={[quota]} now={NOW} />);

    expect(screen.getAllByTestId("quota-value")).toHaveLength(3);
  });
});
