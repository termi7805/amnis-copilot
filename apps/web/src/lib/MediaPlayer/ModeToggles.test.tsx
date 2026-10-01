import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModeToggles, nextRepeat } from "./ModeToggles.tsx";

afterEach(cleanup);

type Props = Parameters<typeof ModeToggles>[0];

function setup(props: Partial<Props> = {}) {
  const onCommand = vi.fn();
  const view = render(
    <ModeToggles
      shuffle={false}
      repeat="off"
      onCommand={onCommand}
      {...props}
    />,
  );
  return { onCommand, ...view };
}

describe("nextRepeat", () => {
  it("recorre off → context → track → off", () => {
    expect(nextRepeat("off")).toBe("context");
    expect(nextRepeat("context")).toBe("track");
    expect(nextRepeat("track")).toBe("off");
  });
});

describe("ModeToggles", () => {
  it("shuffle manda lo contrario de lo que muestra el último media", () => {
    const off = setup({ shuffle: false });
    fireEvent.click(screen.getByRole("button", { name: "Aleatorio" }));
    expect(off.onCommand).toHaveBeenCalledWith({
      kind: "shuffle",
      state: true,
    });
    off.unmount();

    const on = setup({ shuffle: true });
    fireEvent.click(screen.getByRole("button", { name: "Aleatorio" }));
    expect(on.onCommand).toHaveBeenCalledWith({
      kind: "shuffle",
      state: false,
    });
  });

  it.each([
    ["off", "Repetir: no", "context"],
    ["context", "Repetir: lista", "track"],
    ["track", "Repetir: canción", "off"],
  ] as const)("repeat %s (%s) manda %s", (repeat, label, next) => {
    const { onCommand } = setup({ repeat });
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onCommand).toHaveBeenCalledWith({ kind: "repeat", mode: next });
  });

  it("context y track se distinguen: solo track lleva el 1", () => {
    const { rerender } = setup({ repeat: "context" });
    const repeat = () => screen.getByRole("button", { name: /Repetir/ });
    expect(repeat()).toHaveAttribute("data-mode", "context");
    expect(screen.queryByTestId("repeat-one")).toBeNull();

    rerender(
      <ModeToggles shuffle={false} repeat="track" onCommand={vi.fn()} />,
    );
    expect(repeat()).toHaveAttribute("data-mode", "track");
    expect(screen.getByTestId("repeat-one")).toBeInTheDocument();
  });

  it("aria-pressed refleja el estado: shuffle y repeat distinto de off", () => {
    const { rerender } = setup();
    expect(screen.getByRole("button", { name: "Aleatorio" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /Repetir/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    rerender(<ModeToggles shuffle repeat="context" onCommand={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Aleatorio" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Repetir/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("sin un media nuevo, pulsar no cambia lo que se ve (sin optimista)", () => {
    const { rerender } = setup({ shuffle: false, repeat: "off" });
    fireEvent.click(screen.getByRole("button", { name: "Aleatorio" }));
    fireEvent.click(screen.getByRole("button", { name: "Repetir: no" }));
    expect(screen.getByRole("button", { name: "Aleatorio" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("button", { name: "Repetir: no" }),
    ).toBeInTheDocument();

    // Llega el media con el cambio confirmado.
    rerender(<ModeToggles shuffle repeat="context" onCommand={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Aleatorio" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Repetir: lista" }),
    ).toBeInTheDocument();
  });

  it("deshabilitados no mandan nada", () => {
    const { onCommand } = setup({ disabled: true });
    fireEvent.click(screen.getByRole("button", { name: "Aleatorio" }));
    fireEvent.click(screen.getByRole("button", { name: /Repetir/ }));
    expect(onCommand).not.toHaveBeenCalled();
  });
});
