import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UpdateBanner } from "./UpdateBanner.tsx";

const release = (version: string) => ({
  version,
  url: `https://github.com/termi7805/amnis-copilot/releases/tag/v${version}`,
});

afterEach(() => {
  cleanup();
  localStorage.clear();
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

  it("descartada sigue oculta al volver, y otra versión la vuelve a enseñar", () => {
    const first = render(<UpdateBanner update={release("0.3.0")} />);
    fireEvent.click(screen.getByRole("button", { name: "Descartar aviso" }));
    expect(screen.queryByRole("status")).toBeNull();
    first.unmount();

    const again = render(<UpdateBanner update={release("0.3.0")} />);
    expect(screen.queryByRole("status")).toBeNull();
    again.unmount();

    render(<UpdateBanner update={release("0.4.0")} />);
    expect(screen.getByRole("status")).toHaveTextContent("v0.4.0");
  });
});
