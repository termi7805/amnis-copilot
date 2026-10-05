import {
  DEFAULT_SETTINGS,
  type HealthResponse,
  msg,
  type QuotaSnapshot,
  type StateResponse,
} from "@amnis/shared";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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
    measuredAt: "2026-01-01T00:00:00Z",
    shuffle: false,
    repeat: "off",
    device: null,
    vibe: "neutral",
    bpm: null,
  },
  settings: DEFAULT_SETTINGS,
  skins: { rev: 1, skins: [] },
  plan: null,
  update: null,
  quotas: [],
  daemon: {
    version: "0.0.1",
    startedAt: "2026-01-01T00:00:00Z",
    eventsReceived: 0,
    usageEvents: 0,
  },
};

let healthBody: HealthResponse;

describe("Dashboard", () => {
  beforeEach(() => {
    healthBody = {
      checks: [
        {
          name: "daemon",
          ok: true,
          message: msg("raw", { text: "ok" }),
          remedy: null,
        },
      ],
      daemon: {
        version: "0.0.1",
        startedAt: "2026-01-01T00:00:00Z",
        eventsReceived: 0,
      },
    };
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
              url.includes("/api/health")
                ? healthBody
                : url.includes("/api/media/devices")
                  ? { devices: [] }
                  : url.includes("/api/quota/history")
                    ? { samples: [] }
                    : url.includes("/api/activity")
                      ? {
                          day: "2026-01-01",
                          sessions: [],
                          segments: [],
                          byState: {},
                          waiting: { minutes: 0, count: 0 },
                        }
                      : {
                          groupBy: "day",
                          pricesUpdatedAt: "",
                          unpricedModels: [],
                          rows: [],
                        },
            ),
        }),
      ),
    );
  });

  afterEach(() => {
    window.location.hash = "";
    vi.unstubAllGlobals();
    cleanup();
  });

  it("pinta un StateResponse recibido por hello", () => {
    render(<Dashboard />);

    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() => source?.emit("hello", fakeState));

    expect(screen.getByTestId("connection-status")).toHaveTextContent(
      `Daemon conectado · v${fakeState.daemon.version}`,
    );
    // El primero es la tarjeta; el segundo, la vista previa de MusicSettings.
    expect(screen.getAllByTestId("pet")[0]?.dataset.state).toBe("coding");
  });

  it("con locale en se pinta en inglés y un cambio por SSE vuelve al español sin recargar", () => {
    render(<Dashboard />);
    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() =>
      source?.emit("hello", {
        ...fakeState,
        settings: { ...DEFAULT_SETTINGS, locale: "en" },
      }),
    );

    expect(screen.getByTestId("connection-status")).toHaveTextContent(
      "Daemon connected",
    );
    expect(screen.getByRole("link", { name: /Settings/ })).toBeVisible();
    expect(document.body.textContent).toMatch(/\d{1,2}:\d{2}\s?[AP]M/);
    expect(document.documentElement.lang).toBe("en");

    act(() => source?.emit("settings", { ...DEFAULT_SETTINGS, locale: "es" }));
    expect(screen.getByTestId("connection-status")).toHaveTextContent(
      "Daemon conectado",
    );
    expect(document.documentElement.lang).toBe("es");
  });

  it("Cerrar Amnis pide al daemon que se pare", () => {
    render(<Dashboard />);
    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() => source?.emit("hello", fakeState));

    fireEvent.click(screen.getByRole("button", { name: "Cerrar Amnis" }));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/shutdown"),
      { method: "POST" },
    );
  });

  it("sin conexión no hay Cerrar Amnis: no habría a quién pedírselo", () => {
    render(<Dashboard />);
    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() => source?.error());

    expect(
      screen.queryByRole("button", { name: "Cerrar Amnis" }),
    ).not.toBeInTheDocument();
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

  it("sin endpoint OAuth, la tarjeta de 7 d lo dice en vez de un 0 %", () => {
    const quota: QuotaSnapshot = {
      provider: "anthropic",
      authoritative: null,
      local: {
        fiveHourTokens: 100,
        fiveHourUtilization: 30,
        windowStartedAt: "2026-01-01T00:00:00Z",
        calibrated: true,
        ceilingWindows: 3,
        provisionalUtilization: null,
      },
      divergence: null,
      projection: { fiveHourAtReset: null, fiveHourExhaustsAt: null },
      sampledAt: "2026-01-01T00:00:00Z",
      error: msg("raw", { text: "endpoint caído" }),
      rateLimitedAt: null,
    };
    render(<Dashboard />);

    const [source] = FakeEventSource.instances;
    act(() => source?.open());
    act(() => source?.emit("hello", { ...fakeState, quotas: [quota] }));

    expect(screen.getByTestId("five-hour-value")).toHaveTextContent("~30%");
    expect(screen.getByTestId("card-weekly")).toHaveTextContent(
      "Sin el endpoint de Anthropic no hay dato de la semana.",
    );
    expect(screen.getByTestId("card-weekly")).not.toHaveTextContent("0%");
    expect(screen.getByText(/estimación local · endpoint caído/)).toBeVisible();
  });

  it("el raíl cuenta los avisos de salud en Ajustes, en cualquier vista", async () => {
    healthBody.checks = [
      {
        name: "hooks",
        ok: false,
        message: msg("raw", { text: "Faltan hooks" }),
        remedy: msg("raw", { text: "x" }),
      },
      {
        name: "ingesta",
        ok: false,
        message: msg("raw", { text: "Vieja" }),
        remedy: msg("raw", { text: "y" }),
      },
      {
        name: "daemon",
        ok: true,
        message: msg("raw", { text: "ok" }),
        remedy: null,
      },
    ];
    render(<Dashboard />);

    const [source] = FakeEventSource.instances;
    act(() => source?.emit("hello", fakeState));
    await act(async () => {});

    expect(screen.getByLabelText("2 avisos de salud")).toHaveTextContent("2");
  });

  it("sin avisos no hay insignia", async () => {
    render(<Dashboard />);

    const [source] = FakeEventSource.instances;
    act(() => source?.emit("hello", fakeState));
    await act(async () => {});

    expect(screen.queryByRole("status", { name: /de salud/ })).toBeNull();
  });

  const quota: QuotaSnapshot = {
    provider: "anthropic",
    authoritative: null,
    local: {
      fiveHourTokens: 100,
      fiveHourUtilization: 30,
      windowStartedAt: "2026-01-01T00:00:00Z",
      calibrated: true,
      ceilingWindows: 3,
      provisionalUtilization: null,
    },
    divergence: null,
    projection: { fiveHourAtReset: null, fiveHourExhaustsAt: null },
    sampledAt: "2026-01-01T00:00:00Z",
    error: null,
    rateLimitedAt: null,
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
    expect(screen.getByTestId("five-hour-value")).toHaveTextContent("~30%");
    // <Usage/> ya no vive en la portada: pide /api/usage al abrir Histórico.
    goTo("#historico");
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
    expect(
      screen.getByRole("button", { name: "Dispositivo de reproducción" }),
    ).toBeVisible();

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

  function goTo(hash: string) {
    act(() => {
      window.location.hash = hash;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
  }

  it("abre la vista indicada por el hash y marca su enlace como actual", () => {
    window.location.hash = "#actividad";
    render(<Dashboard />);

    expect(screen.getByTestId("activity-title")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Actividad" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Ahora" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("cambiar de vista no abre otra conexión SSE", () => {
    render(<Dashboard />);
    for (const hash of ["#historico", "#actividad", "#ajustes", "#ahora"]) {
      goTo(hash);
    }

    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("Ajustes tiene el tema y la música; ya no hay volcado del JSON", () => {
    render(<Dashboard />);
    expect(document.querySelector("pre")).toBeNull();

    goTo("#ajustes");
    expect(
      screen.getByRole("radiogroup", { name: "Tema" }),
    ).toBeInTheDocument();
  });
});
