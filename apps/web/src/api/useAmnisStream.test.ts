import type { PetSnapshot, QuotaSnapshot, StateResponse } from "@amnis/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAmnisStream } from "./useAmnisStream.ts";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, (e: MessageEvent) => void>();
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

  close() {}
}

const hello: StateResponse = {
  pet: {
    state: "coding",
    since: "2026-01-01T00:00:00Z",
    fatigue: 0.5,
    level: 1,
    reason: "test",
  },
  quotas: [
    {
      provider: "anthropic",
      authoritative: null,
      local: {
        fiveHourTokens: 100,
        fiveHourUtilization: 0.1,
        windowStartedAt: "2026-01-01T00:00:00Z",
      },
      divergence: null,
      sampledAt: "2026-01-01T00:00:00Z",
      error: null,
    },
  ],
  daemon: {
    version: "0.0.1",
    startedAt: "2026-01-01T00:00:00Z",
    eventsReceived: 0,
    usageEvents: 0,
  },
};

describe("useAmnisStream", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aplica hello y luego un state encima, sin perder quotas", () => {
    const { result } = renderHook(() => useAmnisStream());
    const [source] = FakeEventSource.instances;

    act(() => source?.emit("hello", hello));
    expect(result.current.state?.quotas).toHaveLength(1);

    const nextPet: PetSnapshot = { ...hello.pet, state: "testing" };
    act(() => source?.emit("state", nextPet));

    expect(result.current.state?.pet.state).toBe("testing");
    expect(result.current.state?.quotas).toHaveLength(1);
  });

  it("aplica quota sin perder el pet ya conocido", () => {
    const { result } = renderHook(() => useAmnisStream());
    const [source] = FakeEventSource.instances;

    act(() => source?.emit("hello", hello));

    const nextQuotas: QuotaSnapshot[] = [];
    act(() => source?.emit("quota", nextQuotas));

    expect(result.current.state?.quotas).toHaveLength(0);
    expect(result.current.state?.pet.state).toBe("coding");
  });
});
