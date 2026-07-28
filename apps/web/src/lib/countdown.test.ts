import { describe, expect, it } from "vitest";
import { formatUntil } from "./countdown.ts";

const NOW = new Date("2026-01-01T00:00:00Z");

function at(msFromNow: number): string {
  return new Date(NOW.getTime() + msFromNow).toISOString();
}

describe("formatUntil", () => {
  it("sin resetsAt devuelve null — no hay cuenta atrás que dar", () => {
    expect(formatUntil(null, NOW)).toBeNull();
  });

  it("un reset ya pasado dice 'ahora', nunca un número negativo", () => {
    expect(formatUntil(at(-60_000), NOW)).toBe("ahora");
    expect(formatUntil(at(0), NOW)).toBe("ahora");
  });

  it("por debajo de 1h muestra solo minutos", () => {
    expect(formatUntil(at(12 * 60_000), NOW)).toBe("12m");
  });

  it("justo en el límite de 1h ya cuenta como hora", () => {
    expect(formatUntil(at(60 * 60_000), NOW)).toBe("1h 0m");
  });

  it("entre 1h y 1d muestra horas y minutos", () => {
    expect(formatUntil(at((1 * 60 + 47) * 60_000), NOW)).toBe("1h 47m");
  });

  it("justo en el límite de 1d ya cuenta como día", () => {
    expect(formatUntil(at(24 * 60 * 60_000), NOW)).toBe("1d 0h");
  });

  it("a partir de 1d muestra días y horas", () => {
    expect(formatUntil(at((2 * 24 + 5) * 60 * 60_000), NOW)).toBe("2d 5h");
  });
});
