import type { PetState, SessionPet } from "@amnis/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  SessionCarousel,
  useCarouselKeys,
  useSessionCarousel,
} from "./SessionCarousel.tsx";

afterEach(cleanup);

const s = (id: string, identity: number, state: PetState = "coding") =>
  ({
    sessionId: id,
    worktree: `/home/x/${id}`,
    name: id,
    state,
    since: "2026-01-01T00:00:00Z",
    commitHash: null,
    identity,
  }) satisfies SessionPet;

function Harness({
  sessions,
  keys = "window",
}: {
  sessions: SessionPet[];
  keys?: "window" | "local";
}) {
  const carousel = useSessionCarousel(sessions);
  useCarouselKeys(carousel.step, keys === "window");
  return (
    <>
      <span data-testid="shown">{carousel.current?.session.sessionId}</span>
      <SessionCarousel
        carousel={carousel}
        layout="panel"
        localKeys={keys === "local"}
      />
    </>
  );
}

const shown = () => screen.getByTestId("shown").textContent;
const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Sesión siguiente" }));

describe("SessionCarousel", () => {
  it("→ recorre las tres en orden y vuelve a la primera, con contador", () => {
    render(<Harness sessions={[s("a", 0), s("b", 1), s("c", 2)]} />);
    expect(shown()).toBe("a");
    expect(screen.getByText("1/3")).toBeInTheDocument();
    next();
    expect(shown()).toBe("b");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(shown()).toBe("c");
    expect(screen.getByText("3/3")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(shown()).toBe("a");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(shown()).toBe("c");
  });

  it("cada punto lleva el color de su sesión y marca la que pide permiso", () => {
    render(<Harness sessions={[s("a", 0), s("b", 4, "waiting"), s("c", 2)]} />);
    next();
    next();
    expect(shown()).toBe("c");
    const [first, second, third] = screen.getAllByTestId("carousel-dot");
    if (!first || !second || !third) throw new Error("faltan puntos");
    expect(second).toHaveAttribute("data-waiting", "true");
    expect(second.style.background).toBe("var(--id-4)");
    expect(first).not.toHaveAttribute("data-waiting");
    expect(third).toHaveAttribute("aria-current", "true");
    fireEvent.click(second);
    expect(shown()).toBe("b");
  });

  it("cerrar la primera mientras ves la segunda no cambia de mascota", () => {
    const { rerender } = render(
      <Harness sessions={[s("a", 0), s("b", 1), s("c", 2)]} />,
    );
    next();
    expect(shown()).toBe("b");
    rerender(<Harness sessions={[s("b", 1), s("c", 2)]} />);
    expect(shown()).toBe("b");
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("si sale la que ves, pasa a la de su puesto y ahí se queda", () => {
    const { rerender } = render(
      <Harness sessions={[s("a", 0), s("b", 1), s("c", 2), s("d", 3)]} />,
    );
    next();
    rerender(<Harness sessions={[s("a", 0), s("c", 2), s("d", 3)]} />);
    expect(shown()).toBe("c");
    rerender(<Harness sessions={[s("c", 2), s("d", 3)]} />);
    expect(shown()).toBe("c");
  });

  it("una sesión nueva entra al final sin moverte", () => {
    const { rerender } = render(<Harness sessions={[s("a", 0), s("b", 1)]} />);
    next();
    rerender(<Harness sessions={[s("a", 0), s("b", 1), s("c", 2)]} />);
    expect(shown()).toBe("b");
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("con una sola sesión no hay flechas ni contador, solo el nombre", () => {
    render(<Harness sessions={[s("a", 0)]} />);
    expect(
      screen.queryByRole("button", { name: "Sesión siguiente" }),
    ).toBeNull();
    expect(screen.queryByTestId("carousel-dot")).toBeNull();
    expect(screen.getByTestId("carousel")).toHaveTextContent(/^a$/);
  });

  it("con keys=local las flechas de la ventana no son suyas", () => {
    render(<Harness sessions={[s("a", 0), s("b", 1)]} keys="local" />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(shown()).toBe("a");
    fireEvent.keyDown(screen.getByRole("group"), { key: "ArrowRight" });
    expect(shown()).toBe("b");
  });

  it("ignora ←/→ con modificadores", () => {
    render(<Harness sessions={[s("a", 0), s("b", 1)]} />);
    fireEvent.keyDown(window, { key: "ArrowRight", ctrlKey: true });
    expect(shown()).toBe("a");
  });
});
