import type { StateResponse } from "@amnis/shared";
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
});
