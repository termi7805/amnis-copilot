import type { StateResponse } from "@amnis/shared";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UsageAggregateRow } from "../../../api/usage.ts";
import { HistoryView } from "./HistoryView.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const today = new Date().toISOString().slice(0, 10);

function agg(
  key: string,
  costUsd: number,
  extra: Partial<UsageAggregateRow> = {},
): UsageAggregateRow {
  return {
    key,
    sessions: 1,
    inputTokens: 100,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    costUsd,
    ...extra,
  };
}

function stubDaemon(
  projects: UsageAggregateRow[] = [agg("/repo/a", 30), agg("/repo/b", 10)],
) {
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input, "http://daemon.test");
    const body =
      url.pathname === "/api/quota/peaks"
        ? [{ day: today, peak: 100 }]
        : {
            groupBy: url.searchParams.get("groupBy"),
            pricesUpdatedAt: "2026-09-14",
            unpricedModels: [],
            rows:
              url.searchParams.get("groupBy") === "project"
                ? projects
                : [
                    agg(today, 25, { model: "claude-opus-5" }),
                    agg(today, 15, { model: "claude-sonnet-5" }),
                  ],
          };
    return { ok: true, json: () => Promise.resolve(body) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const state = (plan: StateResponse["plan"]) => ({ plan }) as StateResponse;
const PRO = {
  id: "pro",
  label: "Pro",
  monthlyUsd: 20,
  source: "detected" as const,
};

describe("HistoryView", () => {
  it("la cifra clave coincide con la suma de la tabla de proyectos", async () => {
    stubDaemon();
    render(<HistoryView state={state(PRO)} />);
    await waitFor(() =>
      expect(screen.getByTestId("kpi-cost")).toHaveTextContent("$40,00"),
    );
    const projects = screen
      .getAllByTestId("project-cost")
      .map((c) => c.textContent);
    expect(projects).toEqual(["$30,00", "$10,00"]);
  });

  it("el multiplicador cambia al pasar de 30 d a 7 d según el prorrateo", async () => {
    stubDaemon();
    render(<HistoryView state={state(PRO)} />);
    await waitFor(() =>
      expect(screen.getByTestId("history-title")).toHaveTextContent(
        "rinde 2,0 veces",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "7 d" }));
    // 40 / (20·7/30) = 8,57
    await waitFor(() =>
      expect(screen.getByTestId("history-title")).toHaveTextContent(
        "rinde 8,6 veces",
      ),
    );
    expect(screen.getByTestId("history-detail")).toHaveTextContent(
      "prorrateado a 7 días",
    );
  });

  it("sin plan conocido el titular no muestra multiplicador", async () => {
    stubDaemon();
    render(<HistoryView state={state(null)} />);
    await waitFor(() =>
      expect(screen.getByTestId("history-title")).toHaveTextContent(
        "Equivalente de API en 30 días: $40,00",
      ),
    );
    expect(screen.getByTestId("history-title")).not.toHaveTextContent("veces");
  });

  it("con más de 10 proyectos agrupa la cola en 'Otros' y la tabla sigue sumando el total", async () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      agg(`/repo/p${i}`, 40 / 14),
    );
    stubDaemon(many);
    render(<HistoryView state={state(PRO)} />);
    await waitFor(() =>
      expect(screen.getByText("Otros (4)")).toBeInTheDocument(),
    );
    const cells = screen.getAllByTestId("project-cost");
    expect(cells).toHaveLength(11);
    const sum = cells.reduce(
      (t, c) =>
        t + Number((c.textContent ?? "").replace("$", "").replace(",", ".")),
      0,
    );
    expect(sum).toBeCloseTo(40, 1);
  });
});
