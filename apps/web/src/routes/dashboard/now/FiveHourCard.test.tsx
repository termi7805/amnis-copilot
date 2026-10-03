import type { QuotaSnapshot } from "@amnis/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FiveHourCard } from "./FiveHourCard.tsx";

const NOW = new Date("2026-01-01T15:45:00Z");
const base: QuotaSnapshot = {
  provider: "anthropic",
  authoritative: {
    fiveHour: { utilization: 34, resetsAt: "2026-01-01T18:00:00Z" },
    sevenDay: { utilization: 41, resetsAt: null },
    limits: [],
    weeklyBreakdown: null,
  },
  local: {
    fiveHourTokens: 41200,
    fiveHourUtilization: 28,
    windowStartedAt: "2026-01-01T13:00:00Z",
    calibrated: true,
  },
  divergence: 6,
  projection: { fiveHourAtReset: 62 },
  sampledAt: "2026-01-01T15:44:00Z",
  error: null,
};
const samples = [
  { at: "2026-01-01T13:30:00Z", fiveHour: 10, sevenDay: 1, local: 8 },
  { at: "2026-01-01T15:30:00Z", fiveHour: 33, sevenDay: 1, local: 27 },
];

afterEach(cleanup);

describe("FiveHourCard", () => {
  it("con endpoint: número real, divergencia, proyección y su línea", () => {
    render(<FiveHourCard quota={base} samples={samples} now={NOW} />);
    expect(screen.getByTestId("five-hour-value")).toHaveTextContent("34%");
    expect(screen.getByTestId("five-hour-value")).not.toHaveTextContent("~");
    expect(screen.getByTestId("fact-divergence")).toHaveTextContent("+6 pts");
    expect(screen.getByTestId("fact-projection")).toHaveTextContent("62 %");
    expect(screen.getByTestId("spark-projection")).toBeInTheDocument();
    expect(screen.getByTestId("mark-estimate")).toBeInTheDocument();
  });

  it("sin endpoint: `~`, sin divergencia ni proyección", () => {
    const quota = { ...base, authoritative: null, error: "token inválido" };
    render(<FiveHourCard quota={quota} samples={samples} now={NOW} />);
    expect(screen.getByTestId("five-hour-value")).toHaveTextContent("~28%");
    expect(screen.queryByTestId("fact-divergence")).toBeNull();
    expect(screen.queryByTestId("fact-projection")).toBeNull();
    expect(screen.queryByTestId("spark-projection")).toBeNull();
    expect(screen.getByText(/estimación local · token inválido/)).toBeVisible();
  });

  it("sin techo calibrado marca la estimación local y la divergencia como orientativas", () => {
    const quota = { ...base, local: { ...base.local, calibrated: false } };
    render(<FiveHourCard quota={quota} samples={samples} now={NOW} />);
    expect(screen.getByTestId("uncalibrated")).toHaveTextContent(
      "sin calibrar",
    );
    expect(screen.getByTestId("fact-divergence")).toHaveTextContent(
      "orientativo",
    );
  });

  it("calibrado no muestra el aviso", () => {
    render(<FiveHourCard quota={base} samples={samples} now={NOW} />);
    expect(screen.queryByTestId("uncalibrated")).toBeNull();
  });

  it("con endpoint pero sin proyección todavía: guion, no un número inventado", () => {
    const quota = { ...base, projection: { fiveHourAtReset: null } };
    render(<FiveHourCard quota={quota} samples={samples} now={NOW} />);
    expect(screen.getByTestId("fact-projection")).toHaveTextContent("—");
    expect(screen.queryByTestId("spark-projection")).toBeNull();
  });
});
