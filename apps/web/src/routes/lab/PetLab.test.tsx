import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PetLab } from "./PetLab.tsx";

afterEach(cleanup);

// 144 mascotas por render: en jsdom y con la suite entera en paralelo pasan de los 5 s.
describe("PetLab", { timeout: 30_000 }, () => {
  it("pinta los 12 estados × 6 vibes y, aparte, los 12 estados × 6 identidades", () => {
    render(<PetLab />);
    expect(screen.getAllByTestId("pet")).toHaveLength(144);
    const ids = screen
      .getByTestId("identities")
      .querySelectorAll('[data-testid="pet"]');
    expect(ids).toHaveLength(72);
    expect(
      [...ids].slice(0, 6).map((p) => p.getAttribute("data-identity")),
    ).toEqual(["0", "1", "2", "3", "4", "5"]);
  });

  it("la rejilla de vibes va sin identidad hasta elegir una, y el tema se aplica al banco", () => {
    render(<PetLab />);
    const cellPet = () =>
      screen.getByTestId("cell-coding-fiesta").querySelector("svg");
    expect(cellPet()).not.toHaveAttribute("data-identity");
    fireEvent.change(screen.getByTestId("identity-select"), {
      target: { value: "4" },
    });
    expect(cellPet()).toHaveAttribute("data-identity", "4");
    fireEvent.change(screen.getByTestId("theme-select"), {
      target: { value: "nord" },
    });
    expect(screen.getByTestId("pet-lab")).toHaveAttribute("data-theme", "nord");
  });

  it("lleva cascos en un estado con capa y ninguno en waiting ni limited", () => {
    render(<PetLab />);
    const headphonesIn = (state: string) =>
      screen
        .getByTestId(`cell-${state}-fiesta`)
        .querySelectorAll('[data-testid="headphones"]').length;
    expect(headphonesIn("coding")).toBe(1);
    expect(headphonesIn("waiting")).toBe(0);
    expect(headphonesIn("limited")).toBe(0);
  });
});
