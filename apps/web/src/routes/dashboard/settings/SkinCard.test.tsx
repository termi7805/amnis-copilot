import type { SkinsSnapshot } from "@amnis/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reloadSkins } from "../../../api/skins.ts";
import { SkinCard } from "./SkinCard.tsx";

vi.mock("../../../api/skins.ts", () => ({
  fetchSkin: vi.fn(() => new Promise(() => {})),
  reloadSkins: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const catalog: SkinsSnapshot = {
  rev: 1,
  skins: [
    {
      id: "buena",
      name: "Buena",
      states: ["coding"],
      errors: [],
      warnings: [],
    },
    {
      id: "rota",
      name: null,
      states: [],
      errors: ["states.coding.layers[0].src: no existe la imagen"],
      warnings: [],
    },
  ],
};

describe("SkinCard", () => {
  it("lista BIT y las skins, y marca la activa", () => {
    render(<SkinCard petSkin="buena" catalog={catalog} onPetSkin={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "BIT" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: "Buena" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("una skin con errores se lista con ellos y no se puede elegir", () => {
    const onPetSkin = vi.fn();
    render(<SkinCard petSkin={null} catalog={catalog} onPetSkin={onPetSkin} />);
    const rota = screen.getByRole("radio", { name: "rota" });
    expect(rota).toBeDisabled();
    expect(screen.getByText(/no existe la imagen/)).toBeInTheDocument();
    fireEvent.click(rota);
    expect(onPetSkin).not.toHaveBeenCalled();
  });

  it("elegir una skin la guarda; BIT guarda null", () => {
    const onPetSkin = vi.fn().mockResolvedValue({ ok: true });
    render(
      <SkinCard petSkin="buena" catalog={catalog} onPetSkin={onPetSkin} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "BIT" }));
    expect(onPetSkin).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole("radio", { name: "Buena" }));
    expect(onPetSkin).toHaveBeenCalledWith("buena");
  });

  it("si la elegida ya no está, avisa de que la mascota usa BIT", () => {
    render(
      <SkinCard petSkin="borrada" catalog={catalog} onPetSkin={vi.fn()} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/«borrada».*BIT/);
  });

  it("si la elegida está rota, lo dice", () => {
    render(<SkinCard petSkin="rota" catalog={catalog} onPetSkin={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/errores.*BIT/);
  });

  it("sin problema con la elegida no hay aviso", () => {
    render(<SkinCard petSkin="buena" catalog={catalog} onPetSkin={vi.fn()} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("si el daemon no lo guarda, enseña el error", async () => {
    const onPetSkin = vi
      .fn()
      .mockResolvedValue({ ok: false, message: "No se pudo contactar." });
    render(<SkinCard petSkin={null} catalog={catalog} onPetSkin={onPetSkin} />);
    fireEvent.click(screen.getByRole("radio", { name: "Buena" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo contactar.",
    );
  });

  it("el botón vuelve a leer la carpeta", () => {
    vi.mocked(reloadSkins).mockResolvedValue(catalog);
    render(<SkinCard petSkin={null} catalog={catalog} onPetSkin={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Volver a leer la carpeta" }),
    );
    expect(reloadSkins).toHaveBeenCalledOnce();
  });
});
