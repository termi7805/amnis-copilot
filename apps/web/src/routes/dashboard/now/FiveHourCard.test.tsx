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
    ceilingWindows: 3,
    provisionalUtilization: null,
  },
  divergence: 6,
  projection: { fiveHourAtReset: 62 },
  sampledAt: "2026-01-01T15:44:00Z",
  error: null,
  rateLimitedAt: null,
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

  it("con 429 sobre un dato real: sigue siendo el real, con su antigüedad y el aviso (#116)", () => {
    render(
      <FiveHourCard
        quota={{ ...base, rateLimitedAt: "2026-01-01T15:45:00Z" }}
        samples={samples}
        now={NOW}
      />,
    );
    expect(screen.getByTestId("five-hour-value")).toHaveTextContent("34%");
    expect(screen.getByTestId("five-hour-value")).not.toHaveTextContent("~");
    expect(
      screen.getByText(/hace 1 min · la última consulta dio 429/),
    ).toBeInTheDocument();
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

  it("sin techo calibrado no enseña % local ni divergencia, solo los tokens", () => {
    // Techo inicial del plan contra tokens con lectura de caché: ~7089 %.
    const quota = {
      ...base,
      local: { ...base.local, fiveHourUtilization: 7089, calibrated: false },
      divergence: -7055,
    };
    render(<FiveHourCard quota={quota} samples={samples} now={NOW} />);
    expect(screen.getByTestId("uncalibrated")).toHaveTextContent(
      "sin calibrar",
    );
    expect(screen.getByTestId("fact-local")).toHaveTextContent("—");
    expect(screen.getByTestId("fact-local")).not.toHaveTextContent("%");
    expect(screen.getByTestId("fact-divergence")).not.toHaveTextContent("pts");
    expect(screen.queryByTestId("mark-estimate")).toBeNull();
    expect(screen.getByText(/41\.200 tokens/)).toBeVisible();
    // El dato del endpoint sigue mandando arriba.
    expect(screen.getByTestId("five-hour-value")).toHaveTextContent("34%");
  });

  it("sin endpoint y sin calibrar: guion arriba, no un % inventado", () => {
    const quota = {
      ...base,
      authoritative: null,
      local: { ...base.local, fiveHourUtilization: 7089, calibrated: false },
      divergence: null,
    };
    render(<FiveHourCard quota={quota} samples={samples} now={NOW} />);
    expect(screen.getByTestId("five-hour-value")).toHaveTextContent("—");
    expect(screen.getByTestId("five-hour-value")).not.toHaveTextContent("%");
    expect(screen.queryByTestId("sparkline")).toBeNull();
  });

  it("sin endpoint y con 1 ventana: `~N %` provisional 1/3, sin sparkline ni divergencia (#117)", () => {
    const quota = {
      ...base,
      authoritative: null,
      local: {
        ...base.local,
        fiveHourUtilization: 7089,
        calibrated: false,
        ceilingWindows: 1,
        provisionalUtilization: 11.2,
      },
      divergence: null,
    };
    render(<FiveHourCard quota={quota} samples={samples} now={NOW} />);
    expect(screen.getByTestId("five-hour-value")).toHaveTextContent("~11%");
    expect(screen.getByText(/provisional, 1\/3 ventanas/)).toBeVisible();
    expect(screen.getByTestId("fact-local")).toHaveTextContent("~11 %");
    expect(screen.getByTestId("uncalibrated")).toHaveTextContent("1/3");
    expect(screen.queryByTestId("sparkline")).toBeNull();
    expect(screen.queryByTestId("fact-divergence")).toBeNull();
  });

  it("con endpoint y 1 ventana la divergencia sigue en «—»", () => {
    const quota = {
      ...base,
      local: {
        ...base.local,
        calibrated: false,
        ceilingWindows: 1,
        provisionalUtilization: 11.2,
      },
    };
    render(<FiveHourCard quota={quota} samples={samples} now={NOW} />);
    expect(screen.getByTestId("five-hour-value")).toHaveTextContent("34%");
    expect(screen.getByTestId("fact-divergence")).not.toHaveTextContent("pts");
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
