import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PetLab } from "./PetLab.tsx";

afterEach(cleanup);

describe("PetLab", () => {
  it("pinta los 12 estados × 6 vibes", () => {
    render(<PetLab />);
    expect(screen.getAllByTestId("pet")).toHaveLength(72);
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
