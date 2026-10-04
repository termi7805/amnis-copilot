import type { ActivityResponse } from "@amnis/shared";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { dayKey, yesterday } from "../../../lib/activity.ts";
import { ActivityView } from "./ActivityView.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const at = (h: number, m = 0, base = new Date()) =>
  new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    h,
    m,
  ).toISOString();

function activityFor(day: string, base: Date): ActivityResponse {
  return {
    day,
    sessions: [
      {
        sessionId: "s1",
        project: "amnis-copilot",
        gitBranch: "main",
        start: at(9, 0, base),
        end: at(10, 0, base),
        activeMinutes: 60,
        tokens: 1500,
        costUsd: 1.5,
      },
      {
        sessionId: "s2",
        project: "harrow-cli",
        gitBranch: null,
        start: at(9, 30, base),
        end: at(10, 0, base),
        activeMinutes: 30,
        tokens: 10,
        costUsd: 0.1,
      },
    ],
    segments: [
      {
        sessionId: "s1",
        state: "coding",
        group: "working",
        start: at(9, 0, base),
        end: at(9, 40, base),
      },
      {
        sessionId: "s1",
        state: "waiting",
        group: "waiting",
        start: at(9, 40, base),
        end: at(9, 55, base),
      },
      {
        sessionId: "s1",
        state: "resting",
        group: "resting",
        start: at(9, 55, base),
        end: at(10, 0, base),
      },
      {
        sessionId: "s2",
        state: "researching",
        group: "thinking",
        start: at(9, 30, base),
        end: at(10, 0, base),
      },
    ],
    byState: { coding: 40.3, waiting: 15, researching: 30, resting: 5 },
    waiting: { minutes: 15, count: 1 },
  };
}

function stubDaemon() {
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input, "http://daemon.test");
    const body =
      url.pathname === "/api/activity/heatmap"
        ? {
            weeks: 4,
            from: "",
            to: "",
            minutes: Array.from({ length: 7 }, (_, d) =>
              Array.from({ length: 24 }, (_, h) =>
                d === 0 && h === 10 ? 60 : 0,
              ),
            ),
          }
        : activityFor(
            url.searchParams.get("day") ?? "",
            url.searchParams.get("day") === dayKey(new Date())
              ? new Date()
              : yesterday(new Date()),
          );
    return { ok: true, json: () => Promise.resolve(body) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ActivityView", () => {
  it("un carril por sesión y el titular suma las filas de la lista", async () => {
    stubDaemon();
    render(<ActivityView state={null} />);
    await screen.findAllByTestId("lane");
    expect(screen.getAllByTestId("lane")).toHaveLength(2);

    // 40 + 15 + 30 = 85 min = 1 h 25 min; resting no cuenta.
    expect(screen.getByTestId("activity-title").textContent).toBe(
      "Hoy, 1 h 25 min con agentes trabajando",
    );
    const listed = screen
      .getAllByTestId("state-minutes")
      .map((n) => n.textContent);
    expect(listed).toEqual(["40 min", "30 min", "15 min"]);
    expect(screen.getByTestId("activity-detail").textContent).toContain(
      "Amnis te esperó 15 min en 1 permiso.",
    );
  });

  it("el tramo de espera va con rayado, no solo con color", async () => {
    stubDaemon();
    render(<ActivityView state={null} />);
    const timeline = await screen.findByTestId("day-timeline");
    const waiting = timeline.querySelector('rect[data-state="waiting"]');
    expect(waiting?.getAttribute("fill")).toMatch(/^url\(#.+\)$/);
    expect(timeline.querySelector("pattern")).not.toBeNull();
    const working = timeline.querySelector('rect[data-state="coding"]');
    expect(working?.getAttribute("fill")).toBe("var(--act-work)");
  });

  it("Ayer pide el día anterior y quita la marca de ahora", async () => {
    // La línea solo abarca las horas con actividad (9–10 h en el fixture):
    // de madrugada "ahora" cae fuera y no habría marca que quitar.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(at(9, 50)));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const fetchMock = stubDaemon();
    render(<ActivityView state={null} />);
    await screen.findByTestId("now-mark");

    fireEvent.click(screen.getByRole("button", { name: "Ayer" }));
    await waitFor(() =>
      expect(screen.getByTestId("activity-title").textContent).toMatch(
        /^Ayer,/,
      ),
    );
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain(
      `/api/activity?day=${dayKey(yesterday(new Date()))}`,
    );
    expect(screen.queryByTestId("now-mark")).toBeNull();
  });

  it("la tabla marca en curso solo la sesión viva", async () => {
    stubDaemon();
    render(<ActivityView state={null} />);
    await screen.findAllByTestId("lane");
    const table = screen.getByRole("table");
    // Terminan a las 10:00: viva solo si "ahora" cae en ese minuto.
    expect(within(table).getAllByText(/terminada|en curso/)).toHaveLength(2);
  });

  it("pinta el mapa de calor 7×24", async () => {
    stubDaemon();
    render(<ActivityView state={null} />);
    const heat = await screen.findByTestId("heatmap");
    await waitFor(() =>
      expect(heat.querySelectorAll("[data-level]")).toHaveLength(168),
    );
    expect(heat.querySelectorAll('[data-level="4"]')).toHaveLength(1);
  });

  it("si el daemon falla lo dice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    render(<ActivityView state={null} />);
    await screen.findByText("No se pudo leer la actividad");
  });
});
