import {
  DEFAULT_SETTINGS,
  type MediaSnapshot,
  type PetSnapshot,
  type QuotaSnapshot,
  type StateResponse,
} from "@amnis/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAmnisStream } from "./useAmnisStream.ts";

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

const hello: StateResponse = {
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
  settings: DEFAULT_SETTINGS,
  plan: null,
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
    vi.useRealTimers();
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

  it("aplica settings sin perder el resto, y el hello ya las trae (#65)", () => {
    const { result } = renderHook(() => useAmnisStream());
    const [source] = FakeEventSource.instances;

    act(() => source?.emit("hello", hello));
    expect(result.current.state?.settings).toEqual(DEFAULT_SETTINGS);

    const next = { ...DEFAULT_SETTINGS, enabled: false, screenSeconds: 3 };
    act(() => source?.emit("settings", next));

    expect(result.current.state?.settings).toEqual(next);
    expect(result.current.state?.pet.state).toBe("coding");
    expect(result.current.state?.quotas).toHaveLength(1);
  });

  it("un settings antes del hello no rompe nada", () => {
    const { result } = renderHook(() => useAmnisStream());
    const [source] = FakeEventSource.instances;
    act(() => source?.emit("settings", DEFAULT_SETTINGS));
    expect(result.current.state).toBeNull();
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

  it("aplica media sin perder pet ni quotas", () => {
    const { result } = renderHook(() => useAmnisStream());
    const [source] = FakeEventSource.instances;

    act(() => source?.emit("hello", hello));
    expect(result.current.state?.media.status).toBe("not-configured");

    const nextMedia: MediaSnapshot = { ...hello.media, status: "no-device" };
    act(() => source?.emit("media", nextMedia));

    expect(result.current.state?.media.status).toBe("no-device");
    expect(result.current.state?.pet.state).toBe("coding");
    expect(result.current.state?.quotas).toHaveLength(1);
  });

  it("arranca en reconnecting, no en connected — todavía no se alcanzó al daemon", () => {
    const { result } = renderHook(() => useAmnisStream());
    expect(result.current.status).toBe("reconnecting");
  });

  it("onopen marca connected", () => {
    const { result } = renderHook(() => useAmnisStream());
    const [source] = FakeEventSource.instances;

    act(() => source?.open());

    expect(result.current.status).toBe("connected");
  });

  it("un corte que se resuelve antes de 5s se queda en reconnecting", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAmnisStream());
    const [source] = FakeEventSource.instances;

    act(() => source?.open());
    act(() => source?.error());
    expect(result.current.status).toBe("reconnecting");

    act(() => vi.advanceTimersByTime(4_000));
    expect(result.current.status).toBe("reconnecting");
  });

  it("un corte que dura 5s escala a offline", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAmnisStream());
    const [source] = FakeEventSource.instances;

    act(() => source?.open());
    act(() => source?.error());
    act(() => vi.advanceTimersByTime(5_000));

    expect(result.current.status).toBe("offline");
  });

  it("recuperarse solo tras un offline vuelve a connected", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAmnisStream());
    const [source] = FakeEventSource.instances;

    act(() => source?.open());
    act(() => source?.error());
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.status).toBe("offline");

    act(() => source?.open());
    expect(result.current.status).toBe("connected");
  });

  it("errores repetidos no aplazan el offline indefinidamente", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAmnisStream());
    const [source] = FakeEventSource.instances;

    act(() => source?.open());
    act(() => source?.error());
    act(() => vi.advanceTimersByTime(3_000));
    act(() => source?.error());
    act(() => vi.advanceTimersByTime(2_000));

    expect(result.current.status).toBe("offline");
  });

  it("desmontar no deja el temporizador de offline vivo", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useAmnisStream());
    const [source] = FakeEventSource.instances;

    act(() => source?.open());
    act(() => source?.error());
    unmount();

    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.status).toBe("reconnecting");
  });
});
