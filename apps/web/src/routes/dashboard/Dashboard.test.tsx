import type { QuotaSnapshot, StateResponse } from "@amnis/shared";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard.tsx";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, (e: MessageEvent) => void>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(event: string, listener: (e: MessageEvent) => void) {
    this.listeners.set(event, listener);
  }

  emit(event: string, data: unknown) {
    this.listeners.get(event)?.(
      new MessageEvent(event, { data: JSON.stringify(data) }),
    );
  }

  open() {
    this.onopen?.();
  }

  error() {
    this.onerror?.();
  }

  close() {}
}

const fakeState: StateResponse = {
  pet: {
    state: "coding",
    since: "2026-01-01T00:00:00Z",
    fatigue: 0.5,
    level: 1,
    reason: "test",
    commitHash: null,
    listening: null,
  },
  media: {
    status: "not-configured",
    isPlaying: false,
    track: null,
    progressMs: 0,
    measuredAt: "2026-01-01T00:00:00Z",
    shuffle: false,
    repeat: "off",
    device: null,
    vibe: "neutral",
    bpm: null,
  },
  quotas: [],
  daemon: {
    version: "0.0.1",
    startedAt: "2026-01-01T00:00:00Z",
    eventsReceived: 0,
    usageEvents: 0,
  },
};

describe("Dashboard", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    // <Usage/> pide /api/usage al montar; sin este stub, fetch intenta
    // resolver una URL relativa y falla como unhandled rejection.
    // y la tarjeta del reproductor, /api/media/devices.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              url.includes("/api/media/devices")
                ? { devices: [] }
                : { groupBy: "day", pricesUpdatedAt: "", rows: [] },
            ),
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("pinta un StateResponse recibido por hello", () => {
    render(<Dashboard />);

    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() => source?.emit("hello", fakeState));

    expect(screen.getByTestId("connection-status")).toHaveTextContent(
      "conectado",
    );
    expect(screen.getByTestId("pet").dataset.state).toBe("coding");
  });

  it("un error del stream se ve como reconectando, no como conectado", () => {
    render(<Dashboard />);

    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() => source?.error());

    expect(screen.getByTestId("connection-status")).toHaveTextContent(
      "reconectando",
    );
  });

  it("sin endpoint OAuth, el anillo de 7d dice 'sin dato' en vez de un 0%", () => {
    const quota: QuotaSnapshot = {
      provider: "anthropic",
      authoritative: null,
      local: {
        fiveHourTokens: 100,
        fiveHourUtilization: 30,
        windowStartedAt: "2026-01-01T00:00:00Z",
      },
      divergence: null,
      sampledAt: "2026-01-01T00:00:00Z",
      error: "endpoint caído",
    };
    render(<Dashboard />);

    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() => source?.emit("hello", { ...fakeState, quotas: [quota] }));

    const values = screen.getAllByTestId("quota-value");
    expect(values[0]).toHaveTextContent("~30%");
    expect(values[1]).toHaveTextContent("sin dato");
    expect(screen.getByText("endpoint caído")).toBeInTheDocument();
  });

  const quota: QuotaSnapshot = {
    provider: "anthropic",
    authoritative: null,
    local: {
      fiveHourTokens: 100,
      fiveHourUtilization: 30,
      windowStartedAt: "2026-01-01T00:00:00Z",
    },
    divergence: null,
    sampledAt: "2026-01-01T00:00:00Z",
    error: null,
  };

  it("sin login de Spotify la tarjeta muestra su estado vacío y la cuota carga igual", async () => {
    render(<Dashboard />);

    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() =>
      source?.emit("hello", {
        ...fakeState,
        media: { ...fakeState.media, status: "not-logged-in" },
        quotas: [quota],
      }),
    );
    await act(async () => {});

    expect(screen.getByText("Spotify desconectado")).toBeInTheDocument();
    expect(screen.getAllByTestId("quota-value")[0]).toHaveTextContent("~30%");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/usage"));
  });

  it("muestra el reproductor en vivo: un evento media actualiza la tarjeta", async () => {
    const track = {
      id: "t1",
      title: "Blinding Lights",
      artists: ["The Weeknd"],
      album: "After Hours",
      imageUrl: null,
      durationMs: 200_000,
    };
    render(<Dashboard />);

    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() =>
      source?.emit("hello", {
        ...fakeState,
        media: { ...fakeState.media, status: "ok", track, isPlaying: true },
        quotas: [quota],
      }),
    );
    await act(async () => {});

    expect(screen.getByText("Blinding Lights")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Dispositivos" })).toBeVisible();

    act(() =>
      source?.emit("media", {
        ...fakeState.media,
        status: "ok",
        track: { ...track, title: "Save Your Tears" },
        isPlaying: false,
      }),
    );
    expect(screen.getByText("Save Your Tears")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reproducir" }),
    ).toBeInTheDocument();
  }, 15_000);
});
