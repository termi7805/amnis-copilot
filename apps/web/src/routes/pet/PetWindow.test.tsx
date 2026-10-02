import { DEFAULT_MUSIC_PREFS, type StateResponse } from "@amnis/shared";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetWindow } from "./PetWindow.tsx";
import { EXPANDED_WIDTH, resizeWindow } from "./useTauriWindow.ts";

vi.mock("./useTauriWindow.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useTauriWindow.ts")>()),
  resizeWindow: vi.fn(),
}));

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
  settings: DEFAULT_MUSIC_PREFS,
  quotas: [],
  daemon: {
    version: "0.0.1",
    startedAt: "2026-01-01T00:00:00Z",
    eventsReceived: 0,
    usageEvents: 0,
  },
};

const PANEL_KEY = "amnis-pet-panel";
const LAST_PANEL_KEY = "amnis-pet-last-panel";
const LEGACY_KEY = "amnis-pet-quota-panel-expanded";

describe("PetWindow", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}"))),
    );
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

    expect(localStorage.getItem(PANEL_KEY)).toBe("quota");
  });

  it("dentro de Tauri, un pointerdown + movimiento por encima del umbral arrastra y no despliega el panel", async () => {
    // El umbral de arrastre solo importa donde se puede arrastrar de
    // verdad: fuera de Tauri no hay startDragging(), así que ahí un
    // movimiento no cambia nada (ver el test de "un click" de arriba).
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    vi.doMock("@tauri-apps/api/window", () => ({
      getCurrentWindow: () => ({
        startDragging: vi.fn(),
        setSize: vi.fn(),
        setResizable: vi.fn(),
        setMinSize: vi.fn(),
        outerPosition: () => Promise.resolve({ x: 0, y: 0 }),
        setPosition: vi.fn(),
      }),
      LogicalSize: class {},
      LogicalPosition: class {},
      currentMonitor: () => Promise.resolve(null),
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

    expect(localStorage.getItem(PANEL_KEY)).toBe("none");

    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.doUnmock("@tauri-apps/api/window");
  });

  it("el estado desplegado sobrevive a un remontaje vía localStorage", () => {
    localStorage.setItem(PANEL_KEY, "quota");
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

    expect(screen.getAllByTestId("quota-value").length).toBeGreaterThan(0);
  });

  it("pulsar el botón de recarga no pliega el panel — no debe burbujear al toggle de la ventana", () => {
    localStorage.setItem(PANEL_KEY, "quota");
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

    const button = screen.getByRole("button", { name: "Recargar cuota" });
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);

    expect(localStorage.getItem(PANEL_KEY)).toBe("quota");
  });

  it("al pasar a offline cambia a la escena de 'sin conexión', no solo a gris", () => {
    vi.useFakeTimers();
    render(<PetWindow />);
    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() => source?.emit("hello", fakeState));

    act(() => source?.onerror?.());
    // useAmnisStream.ts: OFFLINE_AFTER_MS espera 5s antes de declarar
    // "offline" — un corte breve es "reconnecting", no debe cambiar nada.
    act(() => vi.advanceTimersByTime(5_000));

    const scene = screen.getByTestId("pet").querySelector("[data-look]");
    expect(scene?.getAttribute("data-look")).toBe("offline");

    vi.useRealTimers();
  });
  it("con listening en el snapshot, la mascota lleva cascos; sin él, se los quita (#61, #62)", () => {
    vi.useFakeTimers();
    render(<PetWindow />);
    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() => source?.emit("hello", fakeState));
    expect(screen.queryByTestId("headphones")).toBeNull();

    const listening = {
      vibe: "chill" as const,
      bpm: 90,
      track: { id: "t1", title: "T", artist: "A", imageUrl: null },
    };
    act(() => source?.emit("state", { ...fakeState.pet, listening }));
    expect(screen.getByTestId("headphones").dataset.vibe).toBe("chill");

    act(() => source?.emit("state", { ...fakeState.pet, listening: null }));
    // Se funden antes de desmontarse (#62).
    expect(screen.getByTestId("headphones").dataset.visible).toBe("false");
    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByTestId("headphones")).toBeNull();
    vi.useRealTimers();
  });

  it("un cambio de preferencias del daemon se aplica en vivo, sin reiniciar (#65)", () => {
    vi.useFakeTimers();
    render(<PetWindow />);
    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    const listening = {
      vibe: "fiesta" as const,
      bpm: 120,
      track: { id: "t1", title: "T", artist: "A", imageUrl: null },
    };
    act(() =>
      source?.emit("hello", {
        ...fakeState,
        pet: { ...fakeState.pet, listening },
      }),
    );
    const pet = () => screen.getByTestId("pet") as unknown as HTMLElement;
    expect(screen.getByTestId("headphones")).toBeInTheDocument();
    expect(pet().dataset.motion).toBe("head");

    // Solo el accesorio: la cabeza deja de cabecear, los cascos siguen.
    act(() =>
      source?.emit("settings", { ...DEFAULT_MUSIC_PREFS, motion: "accessory" }),
    );
    expect(pet().dataset.motion).toBe("accessory");
    expect(screen.getByTestId("headphones")).toBeInTheDocument();

    // Interruptor general apagado: Amnis se quita los cascos.
    act(() =>
      source?.emit("settings", { ...DEFAULT_MUSIC_PREFS, enabled: false }),
    );
    expect(screen.queryByTestId("headphones")).toBeNull();

    // Y encendido otra vez, vuelven.
    act(() => source?.emit("settings", DEFAULT_MUSIC_PREFS));
    expect(screen.getByTestId("headphones")).toBeInTheDocument();
    vi.useRealTimers();
  });

  describe("paneles (#57)", () => {
    function mount(state: StateResponse = fakeState) {
      render(<PetWindow />);
      const [source] = FakeEventSource.instances;
      act(() => source?.open());
      act(() => source?.emit("hello", state));
      // Por `data-panel`, no por el bicho: con un panel abierto al arrancar
      // el bicho grande no está en el DOM.
      return (
        document.querySelector<HTMLElement>("[data-panel]") ?? document.body
      );
    }
    const clickWindow = (el: HTMLElement) => {
      fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
      fireEvent.pointerUp(el, { clientX: 10, clientY: 10 });
    };
    const panelOf = () =>
      document.querySelector("[data-panel]")?.getAttribute("data-panel");
    const player = () =>
      screen.queryByRole("region", { name: "Reproductor de Spotify" });

    it("la primera vez, un clic abre la cuota", () => {
      clickWindow(mount());
      expect(panelOf()).toBe("quota");
      expect(screen.getByTestId("activity-label")).toBeInTheDocument();
    });

    it("la pestaña Música cierra la cuota y abre el reproductor, sin perder al bicho", () => {
      const withQuota: StateResponse = {
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
      };
      clickWindow(mount(withQuota));
      expect(screen.getAllByTestId("quota-value").length).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole("tab", { name: "Música" }));
      expect(panelOf()).toBe("media");
      expect(player()).toBeInTheDocument();
      expect(screen.queryByTestId("quota-value")).toBeNull();
      expect(screen.getByTestId("pet")).toBeInTheDocument();
      expect(screen.getByTestId("activity-label")).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Música" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      fireEvent.click(screen.getByRole("tab", { name: "Cuota" }));
      expect(panelOf()).toBe("quota");
      expect(player()).toBeNull();
      expect(screen.getByTestId("pet")).toBeInTheDocument();
    });

    it("pulsar una pestaña no pliega la ventana", () => {
      clickWindow(mount());
      const tab = screen.getByRole("tab", { name: "Música" });
      fireEvent.pointerDown(tab);
      fireEvent.pointerUp(tab);
      expect(panelOf()).toBe("quota");
    });

    it("plegar y volver a abrir recupera el último panel usado", () => {
      const window_ = mount();
      clickWindow(window_);
      fireEvent.click(screen.getByRole("tab", { name: "Música" }));
      clickWindow(window_); // pliega
      expect(panelOf()).toBe("none");
      expect(localStorage.getItem(LAST_PANEL_KEY)).toBe("media");

      clickWindow(window_); // abre: el último, no la cuota
      expect(panelOf()).toBe("media");
    });

    it("la elección de música sobrevive a un remontaje", () => {
      localStorage.setItem(PANEL_KEY, "media");
      mount();
      expect(panelOf()).toBe("media");
      expect(player()).toBeInTheDocument();
    });

    it("plegado y reiniciado, el siguiente clic abre el último panel", () => {
      localStorage.setItem(PANEL_KEY, "none");
      localStorage.setItem(LAST_PANEL_KEY, "media");
      clickWindow(mount());
      expect(panelOf()).toBe("media");
    });

    it("migra la preferencia antigua: 1 abre la cuota, 0 queda plegado", () => {
      localStorage.setItem(LEGACY_KEY, "1");
      mount();
      expect(panelOf()).toBe("quota");
      cleanup();

      localStorage.clear();
      localStorage.setItem(LEGACY_KEY, "0");
      mount();
      expect(panelOf()).toBe("none");
    });

    it("la clave nueva manda sobre la antigua", () => {
      localStorage.setItem(LEGACY_KEY, "1");
      localStorage.setItem(PANEL_KEY, "none");
      mount();
      expect(panelOf()).toBe("none");
    });

    it("la ventana nativa sigue el alto del contenido, no el de la raíz: crece y encoge con él", () => {
      let notify: () => void = () => {};
      const observed: Element[] = [];
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(callback: () => void) {
            notify = callback;
          }
          observe(el: Element) {
            observed.push(el);
          }
          disconnect() {}
        },
      );
      let height = 300;
      const rect = vi
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockImplementation(() => ({ height }) as DOMRect);
      vi.mocked(resizeWindow).mockClear();

      localStorage.setItem(PANEL_KEY, "media");
      mount();

      const root = document.querySelector("[data-panel]");
      expect(observed).toHaveLength(1);
      expect(observed[0]).not.toBe(root);
      expect(observed[0]?.contains(player())).toBe(true);
      expect(resizeWindow).toHaveBeenLastCalledWith(EXPANDED_WIDTH, 300);

      height = 460;
      act(() => notify());
      expect(resizeWindow).toHaveBeenLastCalledWith(EXPANDED_WIDTH, 460);

      height = 330;
      act(() => notify());
      expect(resizeWindow).toHaveBeenLastCalledWith(EXPANDED_WIDTH, 330);

      rect.mockRestore();
    });

    it("el reproductor se ve aunque aún no haya llegado el primer hello", () => {
      localStorage.setItem(PANEL_KEY, "media");
      render(<PetWindow />);
      expect(screen.getByText("Amnis no responde")).toBeInTheDocument();
    });
  });
});
