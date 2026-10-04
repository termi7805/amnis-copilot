import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageCard } from "./LanguageCard.tsx";

afterEach(cleanup);

describe("LanguageCard", () => {
  it("marca el idioma activo y nombra cada idioma en el suyo", () => {
    render(<LanguageCard locale="system" onLocale={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Sistema" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute(
      "lang",
      "en",
    );
  });

  it("elegir English lo pide con en", () => {
    const onLocale = vi.fn().mockResolvedValue({ ok: true });
    render(<LanguageCard locale="es" onLocale={onLocale} />);
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(onLocale).toHaveBeenCalledWith("en");
  });

  it("si el daemon no lo guarda, enseña el error", async () => {
    const onLocale = vi
      .fn()
      .mockResolvedValue({ ok: false, message: "No se pudo contactar." });
    render(<LanguageCard locale="es" onLocale={onLocale} />);
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo contactar.",
    );
  });
});
