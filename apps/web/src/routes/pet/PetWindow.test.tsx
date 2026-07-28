import type { StateResponse } from "@amnis/shared";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetWindow } from "./PetWindow.tsx";

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

const EXPANDED_KEY = "amnis-pet-quota-panel-expanded";

describe("PetWindow", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("arranca plegado: sin panel de cuota", () => {
    render(<PetWindow />);
    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() => source?.emit("hello", fakeState));

    expect(screen.queryByTestId("quota-value")).not.toBeInTheDocument();
  });

  it("un click (sin arrastre) despliega el panel", () => {
    render(<PetWindow />);
    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() => source?.emit("hello", { ...fakeState, quotas: [] }));

    const window_ = screen.getByTestId("pet").closest("div")?.parentElement;
    if (!window_) throw new Error("petWindow no encontrado");

    fireEvent.pointerDown(window_, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window_, { clientX: 10, clientY: 10 });

    expect(localStorage.getItem(EXPANDED_KEY)).toBe("1");
  });

  it("dentro de Tauri, un pointerdown + movimiento por encima del umbral arrastra y no despliega el panel", async () => {
    // El umbral de arrastre solo importa donde se puede arrastrar de
    // verdad: fuera de Tauri no hay startDragging(), así que ahí un
    // movimiento no cambia nada (ver el test de "un click" de arriba).
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    vi.doMock("@tauri-apps/api/window", () => ({
      getCurrentWindow: () => ({ startDragging: vi.fn(), setSize: vi.fn() }),
      LogicalSize: class {},
    }));

    render(<PetWindow />);
    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() => source?.emit("hello", fakeState));

    const window_ = screen.getByTestId("pet").closest("div")?.parentElement;
    if (!window_) throw new Error("petWindow no encontrado");

    fireEvent.pointerDown(window_, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window_, { clientX: 40, clientY: 40 });
    fireEvent.pointerUp(window_, { clientX: 40, clientY: 40 });

    expect(localStorage.getItem(EXPANDED_KEY)).toBe("0");

    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.doUnmock("@tauri-apps/api/window");
  });

  it("el estado desplegado sobrevive a un remontaje vía localStorage", () => {
    localStorage.setItem(EXPANDED_KEY, "1");
    render(<PetWindow />);
    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() =>
      source?.emit("hello", {
        ...fakeState,
        quotas: [
          {
            provider: "anthropic",
            authoritative: null,
            local: {
              fiveHourTokens: 0,
              fiveHourUtilization: 10,
              windowStartedAt: "2026-01-01T00:00:00Z",
            },
            divergence: null,
            sampledAt: "2026-01-01T00:00:00Z",
            error: null,
          },
        ],
      }),
    );

    expect(screen.getByText("Claude")).toBeInTheDocument();
  });
});
