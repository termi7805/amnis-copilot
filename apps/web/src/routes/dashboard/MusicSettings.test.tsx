import { DEFAULT_MUSIC_PREFS } from "@amnis/shared";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusicSettings, SLIDER_DEBOUNCE_MS } from "./MusicSettings.tsx";

function setup(save = vi.fn().mockResolvedValue({ ok: true })) {
  const view = render(
    <MusicSettings settings={DEFAULT_MUSIC_PREFS} save={save} />,
  );
  return { save, ...view };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("MusicSettings", () => {
  it("guarda un select al cambiarlo, con solo ese campo", () => {
    const { save } = setup();
    fireEvent.change(screen.getByLabelText("Entrada"), {
      target: { value: "fade" },
    });
    expect(save).toHaveBeenCalledExactlyOnceWith({ screenEntry: "fade" });
  });

  it("guarda el interruptor general", () => {
    const { save } = setup();
    fireEvent.click(screen.getByLabelText("Mostrar la música en Amnis"));
    expect(save).toHaveBeenCalledWith({ enabled: false });
  });

  it("un slider no guarda en cada movimiento, solo al terminar", async () => {
    const { save } = setup();
    const slider = screen.getByLabelText("Tiempo en pantalla");
    fireEvent.change(slider, { target: { value: "3" } });
    fireEvent.change(slider, { target: { value: "3.5" } });
    fireEvent.change(slider, { target: { value: "4" } });
    expect(save).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(SLIDER_DEBOUNCE_MS));
    expect(save).toHaveBeenCalledExactlyOnceWith({ screenSeconds: 4 });
  });

  it("soltar el slider guarda sin esperar al retardo", () => {
    const { save } = setup();
    const slider = screen.getByLabelText("Amortiguación por fatiga");
    fireEvent.change(slider, { target: { value: "0.5" } });
    fireEvent.pointerUp(slider);
    expect(save).toHaveBeenCalledExactlyOnceWith({ damping: 0.5 });
  });

  it("'Restablecer' envía los valores por defecto completos", () => {
    const { save } = setup();
    fireEvent.click(screen.getByText("Restablecer valores por defecto"));
    expect(save).toHaveBeenCalledExactlyOnceWith(DEFAULT_MUSIC_PREFS);
  });

  it("enseña el error del PUT", async () => {
    const save = vi.fn().mockResolvedValue({
      ok: false,
      message: "screenSeconds fuera de rango",
    });
    setup(save);
    fireEvent.change(screen.getByLabelText("Entrada"), {
      target: { value: "fade" },
    });
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent(
      "screenSeconds fuera de rango",
    );
  });

  it("la vista previa usa el estado de ejemplo elegido", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Estado de ejemplo"), {
      target: { value: "testing" },
    });
    expect(screen.getByTestId("pet")).toHaveAttribute("data-state", "testing");
  });

  it("avisa de que en waiting la capa no se lleva", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Estado de ejemplo"), {
      target: { value: "waiting" },
    });
    expect(screen.getByText(/pide atención/)).toBeInTheDocument();
  });

  it("avisa cuando la música está desactivada", () => {
    render(
      <MusicSettings
        settings={{ ...DEFAULT_MUSIC_PREFS, enabled: false }}
        save={vi.fn()}
      />,
    );
    expect(screen.getByText(/desactivada/)).toBeInTheDocument();
  });

  it("sin estado todavía, los controles están deshabilitados", () => {
    render(<MusicSettings settings={undefined} save={vi.fn()} />);
    expect(screen.getByLabelText("Entrada")).toBeDisabled();
  });
});
