import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdateBanner } from "./UpdateBanner.tsx";

const release = (version: string) => ({
  version,
  url: `https://github.com/termi7805/amnis-copilot/releases/tag/v${version}`,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UpdateBanner", () => {
  it("sin versión nueva no pinta nada", () => {
    const { container } = render(<UpdateBanner update={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("enseña la versión y enlaza a la release", () => {
    render(<UpdateBanner update={release("0.3.0")} />);
    expect(screen.getByRole("status")).toHaveTextContent("v0.3.0");
    expect(screen.getByRole("link", { name: /Ver novedades/ })).toHaveAttribute(
      "href",
      release("0.3.0").url,
    );
  });

  it("descartar se oculta al momento y lo guarda en el daemon para esa versión", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<UpdateBanner update={release("0.3.0")} />);
    fireEvent.click(screen.getByRole("button", { name: "Descartar aviso" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({
      dismissedUpdate: "0.3.0",
    });

    rerender(<UpdateBanner update={release("0.4.0")} />);
    expect(screen.getByRole("status")).toHaveTextContent("v0.4.0");
  });
});
