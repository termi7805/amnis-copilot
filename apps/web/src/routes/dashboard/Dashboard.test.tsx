import type { StateResponse } from "@amnis/shared";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard.tsx";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, (e: MessageEvent) => void>();

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
  });

  it("pinta un StateResponse recibido por hello", () => {
    render(<Dashboard />);

    const [source] = FakeEventSource.instances;
    act(() => source?.emit("hello", fakeState));

    expect(screen.getByText("conectado")).toBeInTheDocument();
    expect(screen.getByTestId("pet").dataset.state).toBe("coding");
  });
});
