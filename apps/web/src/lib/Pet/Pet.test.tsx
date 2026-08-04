import type { PetSnapshot } from "@amnis/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { fatigueLevel, Pet, PetOffline } from "./Pet.tsx";

// Cada `it` renderiza sobre el mismo `document`; sin esto, los `it`
// sucesivos acumulan varios <svg data-testid="pet"> y las queries por
// rol/testid dejan de ser únicas.
afterEach(cleanup);

const ALL_STATES: PetSnapshot["state"][] = [
  "coding",
  "testing",
  "researching",
  "planning",
  "waiting",
  "resting",
  "sleeping",
  "terminal",
  "subagents",
  "committing",
  "pushing",
  "limited",
];

describe("fatigueLevel", () => {
  it("satura por debajo del 10% — fresca", () => {
    expect(fatigueLevel(0.05)).toBe(0);
    expect(fatigueLevel(0.1)).toBe(0);
  });

  it("satura por encima del 85% — agotada", () => {
    expect(fatigueLevel(0.85)).toBe(1);
    expect(fatigueLevel(0.95)).toBe(1);
  });

  it("interpola linealmente entre 10% y 85%", () => {
    expect(fatigueLevel(0.475)).toBeCloseTo(0.5, 5);
  });
});

describe("Pet", () => {
  it("renderiza un <svg> que escala a su contenedor, sin dimensiones fijas", () => {
    render(<Pet state="coding" level={1} fatigue={0.42} />);

    const pet = screen.getByTestId("pet");
    expect(pet.tagName).toBe("svg");
    expect(pet).toHaveAttribute("viewBox");
    expect(pet).toHaveAttribute("width", "100%");
    expect(pet).toHaveAttribute("height", "100%");
    expect(pet.dataset.state).toBe("coding");
    expect(pet.dataset.level).toBe("1");
  });

  it("expone la fatiga normalizada como custom property", () => {
    render(<Pet state="coding" level={1} fatigue={0.475} />);

    const pet = screen.getByTestId("pet");
    expect(pet.style.getPropertyValue("--pet-fatigue")).toBe("0.5");
  });

  it("tiene role=img con un título que describe el estado", () => {
    render(<Pet state="waiting" level={1} fatigue={0} />);

    const pet = screen.getByRole("img");
    expect(pet.querySelector("title")?.textContent).toMatch(/permiso/i);
  });

  it("cada estado produce un `data-look` distinto en su escena", () => {
    const looks = new Set<string | undefined>();

    for (const state of ALL_STATES) {
      const { container, unmount } = render(
        <Pet state={state} level={1} fatigue={0} />,
      );
      const scene = container.querySelector("[data-look]");
      looks.add(scene?.getAttribute("data-look") ?? undefined);
      unmount();
    }

    expect(looks.size).toBe(ALL_STATES.length);
  });

  it("la fatiga no cambia la geometría de la escena, solo el tempo", () => {
    const { container: fresh, unmount: unmountFresh } = render(
      <Pet state="coding" level={1} fatigue={0} />,
    );
    const freshMarkup = fresh.querySelector("[data-testid='pet']")?.innerHTML;
    unmountFresh();

    const { container: tired, unmount: unmountTired } = render(
      <Pet state="coding" level={1} fatigue={1} />,
    );
    const tiredMarkup = tired.querySelector("[data-testid='pet']")?.innerHTML;
    unmountTired();

    expect(freshMarkup).toBe(tiredMarkup);
  });

  it("limited con resetsAt pinta la cuenta atrás", () => {
    render(
      <Pet
        state="limited"
        level={1}
        fatigue={1}
        resetsAt={new Date(Date.now() + 102 * 60_000).toISOString()}
      />,
    );

    const pet = screen.getByRole("img");
    expect(pet.textContent).toMatch(/1h 4[0-3]m/);
  });

  it("limited sin resetsAt no rompe", () => {
    render(<Pet state="limited" level={1} fatigue={1} resetsAt={null} />);

    expect(screen.getByRole("img").querySelector("title")?.textContent).toBe(
      "Límite alcanzado",
    );
  });
});

describe("PetOffline", () => {
  it("es una escena propia, distinta de cualquier PetState", () => {
    render(<PetOffline />);

    const pet = screen.getByRole("img");
    expect(pet.querySelector("title")?.textContent).toMatch(/sin conexión/i);
    expect(pet.querySelector("[data-look]")?.getAttribute("data-look")).toBe(
      "offline",
    );
  });
});
