import {
  type ActivityResponse,
  DEFAULT_SETTINGS,
  type QuotaLimit,
  type QuotaSnapshot,
  type StateResponse,
} from "@amnis/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NowView } from "./NowView.tsx";

const limit = (over: Partial<QuotaLimit>): QuotaLimit => ({
  kind: "weekly_all",
  group: "weekly",
  scope: null,
  utilization: 41,
  resetsAt: "2026-01-08T00:00:00Z",
  severity: "normal",
  isActive: true,
  label: "7d",
  ...over,
});

const FIXED = [
  limit({ kind: "session", group: "session", label: "5h" }),
  limit({}),
];
const FABLE = limit({
  kind: "weekly_fable",
  scope: "fable",
  utilization: 58,
  label: "7d · fable",
});

function stateWith(limits: QuotaLimit[]): StateResponse {
  const quota: QuotaSnapshot = {
    provider: "anthropic",
    authoritative: {
      fiveHour: { utilization: 34, resetsAt: "2026-01-04T18:00:00Z" },
      sevenDay: { utilization: 41, resetsAt: "2026-01-08T00:00:00Z" },
      limits,
      weeklyBreakdown: {
        asOf: null,
        windowStartedAt: null,
        rows: [
          { key: "claude_code", label: "Claude Code", percent: 38 },
          { key: "chat", label: "Chats", percent: 3 },
          { key: "cowork", label: "Cowork", percent: 0 },
        ],
      },
    },
    local: {
      fiveHourTokens: 100,
      fiveHourUtilization: 30,
      windowStartedAt: "2026-01-04T13:00:00Z",
      calibrated: true,
      ceilingWindows: 3,
      provisionalUtilization: null,
    },
    divergence: 4,
    projection: { fiveHourAtReset: 60, fiveHourExhaustsAt: null },
    sampledAt: "2026-01-04T15:00:00Z",
    error: null,
    rateLimitedAt: null,
  };
  return {
    pet: {
      state: "coding",
      since: "2026-01-04T14:00:00Z",
      fatigue: 0.3,
      level: 1,
      reason: "test",
      commitHash: null,
      project: null,
      listening: null,
      focus: { kind: "auto" },
      othersActive: 0,
    },
    media: {
      status: "not-configured",
      isPlaying: false,
      track: null,
      progressMs: 0,
      measuredAt: "2026-01-04T00:00:00Z",
      shuffle: false,
      repeat: "off",
      device: null,
      vibe: "neutral",
      bpm: null,
    },
    settings: DEFAULT_SETTINGS,
    plan: null,
    quotas: [quota],
    daemon: {
      version: "0.0.1",
      startedAt: "2026-01-04T00:00:00Z",
      eventsReceived: 0,
      usageEvents: 0,
    },
  };
}

const activity: ActivityResponse = {
  day: "2026-01-04",
  sessions: [
    {
      sessionId: "s1",
      project: "amnis-copilot",
      gitBranch: "main",
      start: "2026-01-04T10:00:00Z",
      end: "2026-01-04T14:00:00Z",
      activeMinutes: 120,
      tokens: 6_200_000,
      costUsd: 14.8,
    },
  ],
  segments: [
    {
      sessionId: "s1",
      state: "coding",
      group: "working",
      start: "2026-01-04T12:00:00Z",
      end: "2026-01-04T12:30:00Z",
    },
    {
      sessionId: "s1",
      state: "waiting",
      group: "waiting",
      start: "2026-01-04T12:30:00Z",
      end: "2026-01-04T12:32:00Z",
    },
  ],
  byState: {},
  waiting: { minutes: 14, count: 6 },
};

describe("NowView · segunda mitad", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              url.includes("/api/activity")
                ? activity
                : url.includes("/api/quota/history")
                  ? { samples: [] }
                  : url.includes("/api/media/devices")
                    ? { devices: [] }
                    : {
                        groupBy: "day",
                        pricesUpdatedAt: "",
                        unpricedModels: [],
                        rows: [
                          {
                            key: "2026-01-04",
                            sessions: 1,
                            inputTokens: 1_000_000,
                            outputTokens: 200_000,
                            cacheCreationTokens: 0,
                            cacheReadTokens: 5_000_000,
                            costUsd: 14.8,
                          },
                        ],
                      },
            ),
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("con la cuenta actual: tres tarjetas fijas y ninguna de modelo", async () => {
    render(<NowView state={stateWith(FIXED)} />);

    expect(await screen.findByTestId("card-weekly")).toBeVisible();
    expect(screen.getByTestId("card-today")).toBeVisible();
    expect(screen.getByTestId("card-waiting")).toBeVisible();
    expect(screen.queryByTestId("card-model-limit")).toBeNull();
  });

  it("un límite semanal de Fable añade una cuarta tarjeta sin tocar código", async () => {
    render(<NowView state={stateWith([...FIXED, FABLE])} />);

    const card = await screen.findByTestId("card-model-limit");
    expect(card).toHaveTextContent("Semana · Fable");
    expect(card).toHaveTextContent("58%");
    expect(screen.getAllByTestId(/^card-/)).toHaveLength(4);
  });

  it("un límite de un modelo desconocido sale con su nombre, no se descarta", async () => {
    const raro = limit({ kind: "weekly_x", scope: "modelo_nuevo" });
    render(<NowView state={stateWith([...FIXED, raro])} />);

    expect(await screen.findByTestId("card-model-limit")).toHaveTextContent(
      "Semana · Modelo_nuevo",
    );
  });

  it("el reparto por origen atenúa los de 0 % en vez de ocultarlos", async () => {
    render(<NowView state={stateWith(FIXED)} />);

    const origin = await screen.findByTestId("origin");
    const cowork = origin.querySelector("li[data-zero]");
    expect(cowork).toHaveTextContent("Cowork");
    expect(origin.querySelectorAll("li")).toHaveLength(3);
    // La barra solo lleva los que consumen.
    expect(origin.querySelectorAll("[title]")).toHaveLength(2);
  });

  it("«Hoy» se rotula como equivalente de API y aclara que no es dinero gastado", async () => {
    render(<NowView state={stateWith(FIXED)} />);

    const today = await screen.findByTestId("card-today");
    await vi.waitFor(() => expect(today).toHaveTextContent("14,80"));
    expect(today).toHaveTextContent("equiv. API");
    expect(today).toHaveTextContent("No es dinero gastado");
    expect(today).toHaveTextContent("6,2 M tokens · 1 sesión");
  });

  it("«Te esperó» suma lo de /api/activity y enseña el último aviso", async () => {
    render(<NowView state={stateWith(FIXED)} />);

    await vi.waitFor(() =>
      expect(screen.getByTestId("waiting-minutes")).toHaveTextContent("14 min"),
    );
    expect(screen.getByTestId("waiting-count")).toHaveTextContent("6 permisos");
    expect(screen.getByTestId("card-waiting")).toHaveTextContent(
      /último a las .* · 2 min/,
    );
  });

  it("los últimos eventos listan los tramos con su proyecto", async () => {
    render(<NowView state={stateWith(FIXED)} />);

    const feed = await screen.findByTestId("recent-events");
    await vi.waitFor(() =>
      expect(feed).toHaveTextContent("Esperando permiso · amnis-copilot"),
    );
    expect(feed).toHaveTextContent("Escribiendo código");
  });

  it("al cambiar el estado de Amnis vuelve a pedir la actividad", async () => {
    const { rerender } = render(<NowView state={stateWith(FIXED)} />);
    await screen.findByTestId("card-waiting");
    const calls = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([u]) => String(u).includes("/api/activity")).length;
    const before = calls();

    const next = stateWith(FIXED);
    next.pet = { ...next.pet, state: "coding", since: "2026-01-04T14:05:00Z" };
    rerender(<NowView state={next} />);

    await vi.waitFor(() => expect(calls()).toBeGreaterThan(before));
  });

  it("«Actualizar cuota» pide un sondeo y gira hasta que llega otra muestra", async () => {
    const { rerender } = render(<NowView state={stateWith(FIXED)} />);
    const button = screen.getByRole("button", { name: "Actualizar cuota" });
    fireEvent.click(button);

    await vi.waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(
            ([u, init]) =>
              String(u).endsWith("/api/quota/refresh") &&
              (init as RequestInit | undefined)?.method === "POST",
          ),
      ).toBe(true),
    );
    expect(button).toBeDisabled();

    const next = stateWith(FIXED);
    const [quota] = next.quotas;
    if (quota) quota.sampledAt = "2026-01-04T15:03:00Z";
    rerender(<NowView state={next} />);
    expect(button).toBeEnabled();
  });

  it("con 429 el botón deja de girar, avisa y los datos que había se quedan (#116)", async () => {
    const aviso =
      "Anthropic está limitando las consultas, prueba en unos minutos.";
    const original = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) =>
        String(url).endsWith("/api/quota/refresh")
          ? Promise.resolve(
              new Response(JSON.stringify({ error: aviso }), { status: 429 }),
            )
          : original(url, init),
      ),
    );
    render(<NowView state={stateWith(FIXED)} />);
    const button = screen.getByRole("button", { name: "Actualizar cuota" });

    fireEvent.click(button);

    expect(await screen.findByText(aviso)).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("data-refreshing", "false");
    expect(screen.getByTestId("five-hour-value")).toHaveTextContent("34%");
  });
});
