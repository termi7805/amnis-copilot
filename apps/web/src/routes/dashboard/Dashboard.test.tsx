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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ groupBy: "day", pricesUpdatedAt: "", rows: [] }),
      }),
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
});
