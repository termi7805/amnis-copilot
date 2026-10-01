import type { MediaSnapshot } from "@amnis/shared";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaCommand, MediaCommandResult } from "../../api/media.ts";
import { MediaPlayer } from "./MediaPlayer.tsx";

const playing: MediaSnapshot = {
  status: "ok",
  isPlaying: true,
  track: {
    id: "t1",
    title: "Blinding Lights",
    artists: ["The Weeknd", "Otro"],
    album: "After Hours",
    imageUrl: "https://i.scdn.co/image/abc",
    durationMs: 200_000,
  },
  progressMs: 1000,
  measuredAt: "2026-01-01T00:00:00Z",
  shuffle: false,
  repeat: "off",
  device: { id: "d1", name: "Móvil", type: "Smartphone" },
  vibe: "neutral",
  bpm: null,
};

const empty = (status: MediaSnapshot["status"]): MediaSnapshot => ({
  ...playing,
  status,
  isPlaying: false,
  track: null,
  device: null,
});

const ok: MediaCommandResult = { ok: true };

function setup(media: MediaSnapshot | null, result: MediaCommandResult = ok) {
  const onCommand = vi.fn<(c: MediaCommand) => Promise<MediaCommandResult>>(
    () => Promise.resolve(result),
  );
  const view = render(<MediaPlayer media={media} onCommand={onCommand} />);
  return { onCommand, ...view };
}

const stateOf = (container: HTMLElement) =>
  container.querySelector("[data-state]")?.getAttribute("data-state");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("MediaPlayer — estados vacíos", () => {
  const cases: [string, MediaSnapshot | null, string, RegExp][] = [
    ["disconnected", null, "disconnected", /Amnis no responde/],
    [
      "not-configured",
      empty("not-configured"),
      "not-configured",
      /amnis spotify login --client-id/,
    ],
    [
      "not-logged-in",
      empty("not-logged-in"),
      "not-logged-in",
      /Conectar Spotify/,
    ],
    [
      "no-device",
      empty("no-device"),
      "no-device",
      /Abre Spotify en algún dispositivo/,
    ],
    ["unavailable", empty("unavailable"), "unavailable", /Spotify no responde/],
    [
      "no-track",
      { ...playing, track: null },
      "no-track",
      /Sin información de la pista/,
    ],
  ];

  it.each(cases)(
    "%s: se ve y es distinto del resto",
    (_n, media, state, text) => {
      const { container } = setup(media);
      expect(stateOf(container)).toBe(state);
      expect(container.textContent?.trim()).not.toBe("");
      expect(container).toHaveTextContent(text);
    },
  );

  it("ningún estado se parece a otro: cada data-state es único y ninguno está en blanco", () => {
    const all = [...cases.map(([, media]) => media), playing];
    const states = all.map((media) => {
      const { container, unmount } = setup(media);
      const state = stateOf(container);
      expect(container.textContent?.trim()).not.toBe("");
      unmount();
      return state;
    });
    expect(new Set(states).size).toBe(all.length);
  });

  it("no-device y unavailable no se confunden", () => {
    const a = setup(empty("no-device"));
    expect(a.container).not.toHaveTextContent(/no responde/);
    a.unmount();
    const b = setup(empty("unavailable"));
    expect(b.container).not.toHaveTextContent(/Abre Spotify/);
  });

  it("not-configured no ofrece el botón Conectar (aún no hay Client ID)", () => {
    setup(empty("not-configured"));
    expect(screen.queryByRole("button", { name: /Conectar/ })).toBeNull();
  });
});

describe("MediaPlayer — reproduciendo", () => {
  it("muestra título, artistas y la portada del CDN", () => {
    setup(playing);
    expect(screen.getByText("Blinding Lights")).toBeInTheDocument();
    expect(screen.getByText("The Weeknd, Otro")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://i.scdn.co/image/abc",
    );
  });

  it("sin portada, un bloque de relleno y ninguna imagen rota", () => {
    const media = {
      ...playing,
      track: {
        ...(playing.track as NonNullable<typeof playing.track>),
        imageUrl: null,
      },
    };
    setup(media);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Blinding Lights")).toBeInTheDocument();
  });

  it("sonando, el botón principal pausa; los otros van a anterior y siguiente", async () => {
    const { onCommand } = setup(playing);
    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await act(async () => {});
    expect(onCommand.mock.calls.map(([c]) => c)).toEqual([
      "pause",
      "previous",
      "next",
    ]);
  });

  it("en pausa, el botón principal reproduce", () => {
    const { onCommand } = setup({ ...playing, isPlaying: false });
    fireEvent.click(screen.getByRole("button", { name: "Reproducir" }));
    expect(onCommand).toHaveBeenCalledWith("play");
  });
});

describe("MediaPlayer — órdenes en vuelo y errores", () => {
  it("mientras una orden no vuelve, los botones están deshabilitados y un segundo clic no lanza otra", async () => {
    let finish: (r: MediaCommandResult) => void = () => {};
    const onCommand = vi.fn(
      () => new Promise<MediaCommandResult>((r) => (finish = r)),
    );
    render(<MediaPlayer media={playing} onCommand={onCommand} />);

    const pause = screen.getByRole("button", { name: "Pausar" });
    fireEvent.click(pause);
    fireEvent.click(pause);
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(pause).toBeDisabled();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

    await act(async () => finish(ok));
    expect(pause).toBeEnabled();
  });

  it("un error de la orden se ve en el propio componente, no en la consola", async () => {
    setup(playing, {
      ok: false,
      message: "Abre Spotify en algún dispositivo.",
    });
    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Abre Spotify en algún dispositivo.",
    );
  });

  it("el error se limpia al siguiente intento", async () => {
    const onCommand = vi
      .fn<(c: MediaCommand) => Promise<MediaCommandResult>>()
      .mockResolvedValueOnce({ ok: false, message: "403 sin Premium" })
      .mockResolvedValueOnce(ok);
    render(<MediaPlayer media={playing} onCommand={onCommand} />);

    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    await act(async () => {});
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("el error desaparece solo pasados unos segundos", async () => {
    setup(playing, { ok: false, message: "fallo" });
    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(7_000);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("si onCommand lanza, también se ve un error y no se queda bloqueado", async () => {
    const onCommand = vi.fn(() => Promise.reject(new Error("boom")));
    render(<MediaPlayer media={playing} onCommand={onCommand} />);
    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausar" })).toBeEnabled();
  });

  it("el remedio del daemon se muestra junto al error", async () => {
    setup(empty("not-logged-in"), {
      ok: false,
      message: "Falta el Client ID de Spotify.",
      remedy: "amnis spotify login --client-id <tu id>",
    });
    fireEvent.click(screen.getByRole("button", { name: "Conectar Spotify" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Falta el Client ID de Spotify.");
    expect(alert).toHaveTextContent("amnis spotify login --client-id");
  });
});

describe("MediaPlayer — conectar", () => {
  it("el botón lanza connect y avisa de que hay que autorizar en el navegador", async () => {
    const { onCommand } = setup(empty("not-logged-in"));
    fireEvent.click(screen.getByRole("button", { name: "Conectar Spotify" }));
    expect(onCommand).toHaveBeenCalledWith("connect");
    expect(
      await screen.findByText(/Autoriza en el navegador/),
    ).toBeInTheDocument();
  });

  it("el aviso desaparece cuando cambia el estado y no vuelve si regresa al mismo", async () => {
    const onCommand = vi.fn(() => Promise.resolve(ok));
    const { rerender } = render(
      <MediaPlayer media={empty("not-logged-in")} onCommand={onCommand} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Conectar Spotify" }));
    expect(
      await screen.findByText(/Autoriza en el navegador/),
    ).toBeInTheDocument();

    rerender(<MediaPlayer media={playing} onCommand={onCommand} />);
    expect(screen.queryByText(/Autoriza en el navegador/)).toBeNull();

    rerender(
      <MediaPlayer media={empty("not-logged-in")} onCommand={onCommand} />,
    );
    expect(screen.queryByText(/Autoriza en el navegador/)).toBeNull();
  });
});

describe("MediaPlayer — dentro de la ventana de la mascota", () => {
  it("un pointerdown/pointerup en el reproductor no llega al padre (no pliega la ventana)", () => {
    const onDown = vi.fn();
    const onUp = vi.fn();
    render(
      <div onPointerDown={onDown} onPointerUp={onUp}>
        <MediaPlayer media={playing} onCommand={() => Promise.resolve(ok)} />
      </div>,
    );
    const button = screen.getByRole("button", { name: "Pausar" });
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    expect(onDown).not.toHaveBeenCalled();
    expect(onUp).not.toHaveBeenCalled();
  });
});
