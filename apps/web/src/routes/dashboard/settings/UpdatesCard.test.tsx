import { DEFAULT_SETTINGS, type StateResponse } from "@amnis/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdatesCard } from "./UpdatesCard.tsx";

const state = {
  settings: DEFAULT_SETTINGS,
  update: {
    version: "0.3.0",
    url: "https://github.com/termi7805/amnis-copilot/releases/tag/v0.3.0",
  },
  daemon: { version: "0.2.0" },
} as unknown as StateResponse;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UpdatesCard", () => {
  it("enseña la versión instalada y la disponible", () => {
    render(<UpdatesCard state={state} />);
    expect(screen.getByText("Versión instalada: v0.2.0")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "v0.3.0" })).toHaveAttribute(
      "href",
      state.update?.url,
    );
  });

  it("apagar el interruptor guarda checkUpdates: false", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    render(<UpdatesCard state={state} />);
    const toggle = screen.getByRole("switch", {
      name: "Buscar actualizaciones",
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({
      checkUpdates: false,
    });
  });
});
