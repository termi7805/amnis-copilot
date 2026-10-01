import type { MediaSnapshot } from "@amnis/shared";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatTrackTime, ProgressBar } from "./ProgressBar.tsx";

const T0 = Date.parse("2026-01-01T00:00:00Z");

const playing: MediaSnapshot = {
  status: "ok",
  isPlaying: true,
  track: {
    id: "t1",
    title: "x",
    artists: ["y"],
    album: "z",
    imageUrl: null,
    durationMs: 200_000,
  },
  progressMs: 60_000,
  measuredAt: new Date(T0).toISOString(),
  shuffle: false,
  repeat: "off",
  device: null,
  vibe: "neutral",
  bpm: null,
};

const clock = () => T0;
const seekOk = async (_positionMs: number) => true;

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

/** Pista de 100 px desde x = 0: clientX equivale al % de la pista. */
function slider() {
  const el = screen.getByRole("slider");
  el.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
  return el;
}

describe("formatTrackTime", () => {
  it.each([
    [0, "0:00"],
    [59_999, "0:59"],
    [83_000, "1:23"],
    [200_000, "3:20"],
    [3_723_000, "1:02:03"],
    [-5, "0:00"],
  ])("%d ms → %s", (ms, text) => {
    expect(formatTrackTime(ms)).toBe(text);
  });
});

describe("ProgressBar", () => {
  it("muestra posición y duración", () => {
    render(<ProgressBar media={playing} onSeek={seekOk} clock={clock} />);
    expect(screen.getByText("1:00")).toBeInTheDocument();
    expect(screen.getByText("3:20")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toHaveAttribute(
      "aria-valuetext",
      "1:00 de 3:20",
    );
  });

  it("un clic hace seek a la posición pulsada", async () => {
    const onSeek = vi.fn(seekOk);
    render(<ProgressBar media={playing} onSeek={onSeek} clock={clock} />);
    const el = slider();
    fireEvent.pointerDown(el, { clientX: 25 });
    fireEvent.pointerUp(el, { clientX: 25 });
    await act(async () => {});
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(50_000);
  });

  it("arrastrar acota a los extremos de la pista", async () => {
    const onSeek = vi.fn(seekOk);
    render(<ProgressBar media={playing} onSeek={onSeek} clock={clock} />);
    const el = slider();
    fireEvent.pointerDown(el, { clientX: 10 });
    fireEvent.pointerMove(el, { clientX: 500 });
    fireEvent.pointerUp(el, { clientX: 500 });
    await act(async () => {});
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(200_000);
  });

  it("mientras se arrastra, un media nuevo no mueve el pulgar", () => {
    const { rerender } = render(
      <ProgressBar media={playing} onSeek={seekOk} clock={clock} />,
    );
    const el = slider();
    fireEvent.pointerDown(el, { clientX: 50 });
    expect(el).toHaveAttribute("aria-valuenow", "100000");

    rerender(
      <ProgressBar
        media={{ ...playing, progressMs: 5_000 }}
        onSeek={seekOk}
        clock={clock}
      />,
    );
    expect(el).toHaveAttribute("aria-valuenow", "100000");
  });

  it("tras soltar, se queda en el destino aunque llegue un snapshot viejo", async () => {
    const { rerender } = render(
      <ProgressBar media={playing} onSeek={seekOk} clock={clock} />,
    );
    const el = slider();
    fireEvent.pointerDown(el, { clientX: 50 });
    fireEvent.pointerUp(el, { clientX: 50 });
    await act(async () => {});
    // Snapshot medido antes del seek: no debe devolver la barra atrás.
    rerender(<ProgressBar media={playing} onSeek={seekOk} clock={clock} />);
    expect(el).toHaveAttribute("aria-valuenow", "100000");
  });

  it("un snapshot posterior al seek vuelve a mandar", async () => {
    const { rerender } = render(
      <ProgressBar media={playing} onSeek={seekOk} clock={clock} />,
    );
    const el = slider();
    fireEvent.pointerDown(el, { clientX: 50 });
    fireEvent.pointerUp(el, { clientX: 50 });
    await act(async () => {});
    rerender(
      <ProgressBar
        media={{
          ...playing,
          progressMs: 101_000,
          measuredAt: new Date(T0 + 1).toISOString(),
        }}
        onSeek={seekOk}
        clock={clock}
      />,
    );
    expect(el).toHaveAttribute("aria-valuenow", "101000");
  });

  it("si el seek falla, vuelve a la posición real", async () => {
    render(
      <ProgressBar media={playing} onSeek={async () => false} clock={clock} />,
    );
    const el = slider();
    fireEvent.pointerDown(el, { clientX: 50 });
    fireEvent.pointerUp(el, { clientX: 50 });
    await act(async () => {});
    expect(el).toHaveAttribute("aria-valuenow", "60000");
  });

  it("las flechas saltan 5 s", async () => {
    const onSeek = vi.fn(seekOk);
    render(<ProgressBar media={playing} onSeek={onSeek} clock={clock} />);
    const el = screen.getByRole("slider");
    fireEvent.keyDown(el, { key: "ArrowRight" });
    await act(async () => {});
    fireEvent.keyDown(el, { key: "ArrowLeft" });
    await act(async () => {});
    // La segunda parte de la posición ya movida por la primera.
    expect(onSeek.mock.calls.map(([ms]) => ms)).toEqual([65_000, 60_000]);
  });

  it("deshabilitada no hace seek", () => {
    const onSeek = vi.fn(seekOk);
    render(
      <ProgressBar media={playing} onSeek={onSeek} clock={clock} disabled />,
    );
    const el = slider();
    fireEvent.pointerDown(el, { clientX: 50 });
    fireEvent.pointerUp(el, { clientX: 50 });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("sin pista o sin duración no hay barra", () => {
    const track = playing.track as NonNullable<typeof playing.track>;
    const { container, rerender } = render(
      <ProgressBar media={{ ...playing, track: null }} onSeek={seekOk} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <ProgressBar
        media={{ ...playing, track: { ...track, durationMs: 0 } }}
        onSeek={seekOk}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
