import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelHeader } from "./PanelHeader.tsx";

afterEach(cleanup);

describe("PanelHeader", () => {
  it("marca la pestaña activa", () => {
    render(
      <PanelHeader status="connected" active="media" onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("tab", { name: "Música" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Cuota" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("pulsar la otra pestaña la selecciona", () => {
    const onSelect = vi.fn();
    render(
      <PanelHeader status="connected" active="quota" onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Música" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("media");
  });

  it("los eventos de puntero de las pestañas no llegan al padre (no pliegan la ventana)", () => {
    const onDown = vi.fn();
    const onUp = vi.fn();
    render(
      <div onPointerDown={onDown} onPointerUp={onUp}>
        <PanelHeader status="connected" active="quota" onSelect={vi.fn()} />
      </div>,
    );
    const tab = screen.getByRole("tab", { name: "Música" });
    fireEvent.pointerDown(tab);
    fireEvent.pointerUp(tab);
    expect(onDown).not.toHaveBeenCalled();
    expect(onUp).not.toHaveBeenCalled();
  });

  it("sin onSelect no hay pestañas, pero sí la marca", () => {
    render(<PanelHeader status="connected" active="quota" />);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("AMNIS")).toBeInTheDocument();
  });

  it("con foco enseña el selector y su pointerdown no llega a la ventana", () => {
    const onPointerDown = vi.fn();
    render(
      <div onPointerDown={onPointerDown}>
        <PanelHeader
          status="connected"
          active="quota"
          onSelect={vi.fn()}
          focus={{ kind: "worktree", worktree: "/home/x/repo-1" }}
          now={new Date()}
        />
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "Foco de la mascota" });
    expect(trigger).toHaveTextContent("repo-1");
    fireEvent.pointerDown(trigger);
    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it("sin foco no hay selector", () => {
    render(<PanelHeader status="connected" active="quota" />);
    expect(
      screen.queryByRole("button", { name: "Foco de la mascota" }),
    ).toBeNull();
  });
});
