import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QuotaRing } from "./QuotaRing.tsx";

const NOW = new Date("2026-01-01T00:00:00Z");

afterEach(cleanup);

describe("QuotaRing", () => {
  it("con dato autoritativo, la cifra no lleva ~", () => {
    render(
      <QuotaRing
        label="5h"
        authoritative={{
          utilization: 47,
          resetsAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
        }}
        estimated={null}
        now={NOW}
      />,
    );

    expect(screen.getByTestId("quota-value")).toHaveTextContent("47%");
    expect(screen.getByTestId("quota-value").textContent).not.toContain("~");
    expect(screen.getByTestId("quota-countdown")).toHaveTextContent("1h 0m");
  });

  it("sin endpoint pero con estimación local, la cifra lleva ~", () => {
    render(
      <QuotaRing label="5h" authoritative={null} estimated={30} now={NOW} />,
    );

    expect(screen.getByTestId("quota-value")).toHaveTextContent("~30%");
    expect(screen.getByTestId("quota-countdown")).toHaveTextContent("estimado");
  });

  it("sin ningún dato muestra 'sin dato', nunca un 0%", () => {
    render(
      <QuotaRing label="7d" authoritative={null} estimated={null} now={NOW} />,
    );

    expect(screen.getByTestId("quota-value")).toHaveTextContent("sin dato");
    expect(screen.getByTestId("quota-value").textContent).not.toContain("0%");
  });

  it("una utilización por encima de 100 muestra el valor real, no un 100% recortado", () => {
    render(
      <QuotaRing
        label="7d"
        authoritative={{ utilization: 130, resetsAt: null }}
        estimated={null}
        now={NOW}
      />,
    );

    expect(screen.getByTestId("quota-value")).toHaveTextContent("130%");
  });

  it("autoritativo sin resetsAt dice que falta el dato del endpoint, no calla", () => {
    render(
      <QuotaRing
        label="7d"
        authoritative={{ utilization: 40, resetsAt: null }}
        estimated={null}
        now={NOW}
      />,
    );

    expect(screen.getByTestId("quota-countdown")).toHaveTextContent(
      "sin dato del endpoint",
    );
  });
});
