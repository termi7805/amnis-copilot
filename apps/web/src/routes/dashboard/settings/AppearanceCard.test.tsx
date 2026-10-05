import { THEMES } from "@amnis/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceCard } from "./AppearanceCard.tsx";

afterEach(cleanup);

const ok = () => vi.fn().mockResolvedValue({ ok: true });

const desplegar = () =>
  fireEvent.click(screen.getByRole("button", { name: /Más temas/ }));

describe("AppearanceCard", () => {
  it("pinta una muestra por tema del catálogo, agrupadas por esquema", () => {
    render(
      <AppearanceCard
        theme="system"
        onTheme={ok()}
        petScale={1}
        onPetScale={ok()}
      />,
    );
    desplegar();
    expect(screen.getAllByRole("radio")).toHaveLength(THEMES.length);

    const nombres = (grupo: string) =>
      screen
        .getByRole("group", { name: grupo })
        .querySelectorAll('[role="radio"]');
    expect(nombres("Sistema")).toHaveLength(1);
    expect(nombres("Claros")).toHaveLength(
      THEMES.filter((t) => t.scheme === "light").length,
    );
    expect(nombres("Oscuros")).toHaveLength(
      THEMES.filter((t) => t.scheme === "dark").length,
    );
    // Agrupa por esquema, no por origen: Papel (propio) y Solarized (con nombre) van juntos.
    expect(screen.getByRole("radio", { name: "Solarized" })).toBeVisible();
    expect(
      screen
        .getByRole("group", { name: "Claros" })
        .contains(screen.getByRole("radio", { name: "Solarized" })),
    ).toBe(true);
  });

  it("solo la muestra activa está marcada", () => {
    render(
      <AppearanceCard
        theme="nord"
        onTheme={ok()}
        petScale={1}
        onPetScale={ok()}
      />,
    );
    const marcadas = screen
      .getAllByRole("radio")
      .filter((r) => r.getAttribute("aria-checked") === "true");
    expect(marcadas.map((r) => r.textContent)).toEqual(["Nord"]);
  });

  it("cada muestra lleva su data-theme y Sistema va partida en claro/oscuro", () => {
    render(
      <AppearanceCard
        theme="light"
        onTheme={ok()}
        petScale={1}
        onPetScale={ok()}
      />,
    );
    desplegar();
    const temas = (nombre: string) =>
      [
        ...screen
          .getByRole("radio", { name: nombre })
          .querySelectorAll("[data-theme]"),
      ].map((e) => e.getAttribute("data-theme"));
    expect(temas("Sistema")).toEqual(["light", "dark"]);
    expect(temas("Dracula")).toEqual(["dracula"]);
  });

  it("elegir una muestra llama a onTheme con su id", async () => {
    const onTheme = ok();
    render(
      <AppearanceCard
        theme="light"
        onTheme={onTheme}
        petScale={1}
        onPetScale={ok()}
      />,
    );
    desplegar();
    fireEvent.click(screen.getByRole("radio", { name: "Gruvbox" }));
    expect(onTheme).toHaveBeenCalledWith("gruvbox");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("un error al guardar se enseña en la tarjeta y se quita al acertar", async () => {
    const onTheme = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: "No se pudo contactar" })
      .mockResolvedValueOnce({ ok: true });
    render(
      <AppearanceCard
        theme="light"
        onTheme={onTheme}
        petScale={1}
        onPetScale={ok()}
      />,
    );
    desplegar();
    fireEvent.click(screen.getByRole("radio", { name: "Nord" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo contactar",
    );
    fireEvent.click(screen.getByRole("radio", { name: "Dracula" }));
    await vi.waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("las flechas pasan a la muestra siguiente y la eligen", () => {
    const onTheme = ok();
    render(
      <AppearanceCard
        theme="system"
        onTheme={onTheme}
        petScale={1}
        onPetScale={ok()}
      />,
    );
    const sistema = screen.getByRole("radio", { name: "Sistema" });
    sistema.focus();
    fireEvent.keyDown(sistema, { key: "ArrowRight" });
    expect(onTheme).toHaveBeenCalledWith(
      THEMES.filter((t) => t.scheme === "light")[0]?.id,
    );
  });

  it("solo la muestra activa entra en el orden de tabulación", () => {
    render(
      <AppearanceCard
        theme="nord"
        onTheme={ok()}
        petScale={1}
        onPetScale={ok()}
      />,
    );
    const tabulables = screen
      .getAllByRole("radio")
      .filter((r) => r.tabIndex === 0);
    expect(tabulables.map((r) => r.textContent)).toEqual(["Nord"]);
  });

  it("plegada por defecto: Sistema, Claro y Oscuro y un botón para el resto", () => {
    render(
      <AppearanceCard
        theme="system"
        onTheme={ok()}
        petScale={1}
        onPetScale={ok()}
      />,
    );
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "Sistema",
      "Claro",
      "Oscuro",
    ]);
    const boton = screen.getByRole("button", {
      name: `Más temas (${THEMES.length - 3})`,
    });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(boton.getAttribute("aria-controls")).toBe(
      screen.getByRole("radiogroup").id,
    );
  });

  it("con un tema oculto activo, la fila plegada lo enseña marcado y tabulable", () => {
    render(
      <AppearanceCard
        theme="nord"
        onTheme={ok()}
        petScale={1}
        onPetScale={ok()}
      />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toContain("Nord");
    expect(radios).toHaveLength(4);
    expect(
      radios.filter((r) => r.tabIndex === 0).map((r) => r.textContent),
    ).toEqual(["Nord"]);
    expect(screen.getByRole("radio", { name: "Nord" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("button", { name: `Más temas (${THEMES.length - 4})` }),
    ).toBeVisible();
  });

  it("«Más temas» despliega el catálogo y «Menos temas» lo pliega", () => {
    render(
      <AppearanceCard
        theme="light"
        onTheme={ok()}
        petScale={1}
        onPetScale={ok()}
      />,
    );
    desplegar();
    expect(screen.getAllByRole("radio")).toHaveLength(THEMES.length);
    const boton = screen.getByRole("button", { name: "Menos temas" });
    expect(boton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(boton);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("plegada, las flechas recorren solo las muestras visibles", () => {
    const onTheme = ok();
    render(
      <AppearanceCard
        theme="dark"
        onTheme={onTheme}
        petScale={1}
        onPetScale={ok()}
      />,
    );
    const oscuro = screen.getByRole("radio", { name: "Oscuro" });
    oscuro.focus();
    fireEvent.keyDown(oscuro, { key: "ArrowRight" });
    expect(onTheme).toHaveBeenCalledWith("system");
  });

  it("al volver a montar la tarjeta sale plegada aunque se hubiera desplegado", () => {
    const { unmount } = render(
      <AppearanceCard
        theme="light"
        onTheme={ok()}
        petScale={1}
        onPetScale={ok()}
      />,
    );
    desplegar();
    unmount();
    render(
      <AppearanceCard
        theme="light"
        onTheme={ok()}
        petScale={1}
        onPetScale={ok()}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("el tamaño de la mascota marca la escala recibida y guarda la elegida", () => {
    const onPetScale = ok();
    render(
      <AppearanceCard
        theme="system"
        onTheme={ok()}
        petScale={1}
        onPetScale={onPetScale}
      />,
    );
    expect(screen.getByRole("button", { name: "100 %" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "130 %" }));
    expect(onPetScale).toHaveBeenCalledWith(1.3);
  });
});
