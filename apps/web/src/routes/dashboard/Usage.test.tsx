import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UsageResponse } from "../../api/usage.ts";
import { Usage } from "./Usage.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function stubFetch(response: UsageResponse) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Usage", () => {
  it("una fila sin proyecto se pinta como '(sin proyecto)', no como fila muda", async () => {
    stubFetch({
      groupBy: "project",
      pricesUpdatedAt: "2026-07-27",
      rows: [
        {
          key: "",
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          costUsd: 1.5,
        },
      ],
    });

    render(<Usage />);
    const select = screen.getByDisplayValue("Día");
    act(() => {
      (select as HTMLSelectElement).value = "project";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await waitFor(() =>
      expect(screen.getByText("(sin proyecto)")).toBeInTheDocument(),
    );
  });

  it("el coste de cada fila incluye la etiqueta 'equiv. API'", async () => {
    stubFetch({
      groupBy: "model",
      pricesUpdatedAt: "2026-07-27",
      rows: [
        {
          key: "claude-sonnet-5",
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          costUsd: 3,
        },
      ],
    });

    render(<Usage />);
    const select = screen.getByDisplayValue("Día");
    act(() => {
      (select as HTMLSelectElement).value = "model";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await waitFor(() =>
      expect(screen.getByTestId("usage-cost")).toHaveTextContent("equiv. API"),
    );
  });

  it("muestra la fecha de actualización de precios", async () => {
    stubFetch({ groupBy: "day", pricesUpdatedAt: "2026-07-27", rows: [] });

    render(<Usage />);

    await waitFor(() =>
      expect(screen.getByText(/2026-07-27/)).toBeInTheDocument(),
    );
  });

  it("cambiar el rango dispara un nuevo fetch con un `from` distinto", async () => {
    const fetchMock = stubFetch({
      groupBy: "day",
      pricesUpdatedAt: "2026-07-27",
      rows: [],
    });

    render(<Usage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const firstUrl = fetchMock.mock.calls[0]?.[0] as string;

    const rangeSelect = screen.getByDisplayValue("7 días");
    act(() => {
      (rangeSelect as HTMLSelectElement).value = "30";
      rangeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondUrl = fetchMock.mock.calls[1]?.[0] as string;
    expect(secondUrl).not.toBe(firstUrl);
  });
});
