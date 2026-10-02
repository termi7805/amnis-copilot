import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useTheme } from "./theme.ts";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("useTheme", () => {
  it("arranca en sistema sin preferencia guardada", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("system");
  });

  it("arranca con la preferencia guardada", () => {
    localStorage.setItem("amnis-theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("dark");
  });

  it("ignora un valor guardado que no es un tema", () => {
    localStorage.setItem("amnis-theme", "sepia");
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("system");
  });

  it("fuerza un tema: atributo en <html> y clave guardada", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]("dark"));
    expect(result.current[0]).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("amnis-theme")).toBe("dark");
  });

  it("volver a sistema quita atributo y clave", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]("light"));
    act(() => result.current[1]("system"));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("amnis-theme")).toBeNull();
  });
});
