import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pet } from "./Pet.tsx";

describe("Pet", () => {
  it("renderiza con {state, level, fatigue} sin fondo ni tamaño propio", () => {
    render(<Pet state="coding" level={1} fatigue={0.42} />);

    const pet = screen.getByTestId("pet");
    expect(pet.dataset.state).toBe("coding");
    expect(pet.dataset.level).toBe("1");
    expect(screen.getByText("42%")).toBeInTheDocument();
  });
});
