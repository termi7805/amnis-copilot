import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parseView, useHashView } from "./useHashView.ts";

describe("useHashView", () => {
  afterEach(() => {
    cleanup();
    window.location.hash = "";
  });

  it("un hash vacío o desconocido cae en ahora", () => {
    expect(parseView("")).toBe("ahora");
    expect(parseView("#nada")).toBe("ahora");
  });

  it("lee la vista del hash y reacciona a hashchange", () => {
    window.location.hash = "#actividad";
    const { result } = renderHook(() => useHashView());
    expect(result.current).toBe("actividad");

    act(() => {
      window.location.hash = "#ajustes";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current).toBe("ajustes");
  });
});
