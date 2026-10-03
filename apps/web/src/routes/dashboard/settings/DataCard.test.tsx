import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataCard } from "./DataCard.tsx";

afterEach(cleanup);

const OK = { ok: true, body: {} } as const;

describe("DataCard", () => {
  it("pide confirmación en la página y cancelar no reconstruye", () => {
    const start = vi.fn().mockResolvedValue(OK);
    render(<DataCard rebuild={null} start={start} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Reconstruir la caché" }),
    );
    expect(screen.getByText(/Tarda unos segundos/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(start).not.toHaveBeenCalled();
    expect(screen.queryByText(/Tarda unos segundos/)).toBeNull();
  });

  it("explica qué se conserva", () => {
    render(<DataCard rebuild={null} />);
    expect(screen.getByText(/sin borrar nada/)).toBeVisible();
  });

  it("confirmar lanza la reconstrucción y espera al evento rebuild", async () => {
    const start = vi.fn().mockResolvedValue(OK);
    const { rerender } = render(<DataCard rebuild={null} start={start} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Reconstruir la caché" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reconstruir" }));
    await act(async () => {});

    expect(start).toHaveBeenCalledOnce();
    const busy = screen.getByRole("button", { name: "Reconstruyendo…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");

    rerender(
      <DataCard
        rebuild={{ seq: 1, event: { status: "done" } }}
        start={start}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Caché reconstruida.");
    expect(
      screen.getByRole("button", { name: "Reconstruir la caché" }),
    ).toBeEnabled();
  });

  it("un evento de error se enseña", async () => {
    const start = vi.fn().mockResolvedValue(OK);
    const { rerender } = render(<DataCard rebuild={null} start={start} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Reconstruir la caché" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reconstruir" }));
    await act(async () => {});

    rerender(
      <DataCard
        rebuild={{ seq: 1, event: { status: "error", error: "disco lleno" } }}
        start={start}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("disco lleno");
  });

  it("un 409 (ya hay una en curso) se enseña y no se queda esperando", async () => {
    const start = vi.fn().mockResolvedValue({
      ok: false,
      message: "Ya hay una reconstrucción en curso.",
    });
    render(<DataCard rebuild={null} start={start} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Reconstruir la caché" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reconstruir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya hay una reconstrucción",
    );
    expect(
      screen.getByRole("button", { name: "Reconstruir la caché" }),
    ).toBeEnabled();
  });

  it("un rebuild que ya estaba al montar no cuenta como el de esta tarjeta", () => {
    render(
      <DataCard
        rebuild={{ seq: 3, event: { status: "done" } }}
        start={vi.fn()}
      />,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
