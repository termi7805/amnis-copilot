import { DEFAULT_MUSIC_PREFS } from "@amnis/shared";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusicSettings, SLIDER_DEBOUNCE_MS } from "./MusicSettings.tsx";

/** Botón de un segmentado: el nombre del grupo desambigua opciones repetidas
 * ("Solo cascos" está en dos). */
function option(group: string, label: string) {
  return within(screen.getByRole("group", { name: group })).getByRole(
    "button",
    { name: label },
  );
}

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
  it("guarda un segmentado al pulsarlo, con solo ese campo", () => {
    const { save } = setup();
    fireEvent.click(option("Entrada", "Fundido"));
    expect(save).toHaveBeenCalledExactlyOnceWith({ screenEntry: "fade" });
  });

  it("el segmentado marca la opción guardada", () => {
    setup();
    expect(option("Color de la capa", "Vibe")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(option("Color de la capa", "Teal")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("guarda el desplegable de pantalla", () => {
    const { save } = setup();
    fireEvent.change(screen.getByLabelText("Pantalla al cambiar de canción"), {
      target: { value: "text" },
    });
    expect(save).toHaveBeenCalledExactlyOnceWith({ screen: "text" });
  });

  it("guarda el interruptor general", () => {
    const { save } = setup();
    const toggle = screen.getByRole("switch", { name: "Capa de música" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
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
    fireEvent.click(option("Entrada", "Fundido"));
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
    expect(option("Entrada", "Fundido")).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: "Capa de música" }),
    ).toBeDisabled();
  });
});
