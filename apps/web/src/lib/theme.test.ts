import { type AmnisSettings, DEFAULT_SETTINGS } from "@amnis/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "./theme.ts";

const withTheme = (theme: AmnisSettings["theme"]): AmnisSettings => ({
  ...DEFAULT_SETTINGS,
  theme,
});

const okSave = () => vi.fn().mockResolvedValue({ ok: true });

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("useTheme", () => {
  it("arranca en sistema sin caché ni ajustes", () => {
    const { result } = renderHook(() => useTheme(undefined, okSave()));
    expect(result.current[0]).toBe("system");
  });

  it("arranca con la caché mientras no llegan los ajustes", () => {
    localStorage.setItem("amnis-theme", "dark");
    const { result } = renderHook(() => useTheme(undefined, okSave()));
    expect(result.current[0]).toBe("dark");
  });

  it("ignora una caché que no es del catálogo", () => {
    localStorage.setItem("amnis-theme", "sepia");
    const { result } = renderHook(() => useTheme(undefined, okSave()));
    expect(result.current[0]).toBe("system");
  });

  it("los ajustes del daemon ganan a la caché y la refrescan", () => {
    localStorage.setItem("amnis-theme", "dark");
    const save = okSave();
    const { result } = renderHook(() => useTheme(withTheme("nord"), save));
    expect(result.current[0]).toBe("nord");
    expect(document.documentElement.dataset.theme).toBe("nord");
    expect(localStorage.getItem("amnis-theme")).toBe("nord");
    expect(save).not.toHaveBeenCalled();
  });

  it("un cambio del daemon por SSE se aplica sin recargar", () => {
    const { result, rerender } = renderHook(({ s }) => useTheme(s, okSave()), {
      initialProps: { s: withTheme("light") },
    });
    rerender({ s: withTheme("dracula") });
    expect(result.current[0]).toBe("dracula");
    expect(document.documentElement.dataset.theme).toBe("dracula");
  });

  it("elegir un tema lo aplica, lo cachea y lo guarda en el daemon", () => {
    const save = okSave();
    const { result } = renderHook(() => useTheme(undefined, save));
    act(() => result.current[1]("dark"));
    expect(result.current[0]).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("amnis-theme")).toBe("dark");
    expect(save).toHaveBeenCalledWith({ theme: "dark" });
  });

  it("volver a sistema quita atributo y clave", () => {
    const save = okSave();
    const { result } = renderHook(() => useTheme(undefined, save));
    act(() => result.current[1]("light"));
    act(() => result.current[1]("system"));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("amnis-theme")).toBeNull();
    expect(save).toHaveBeenLastCalledWith({ theme: "system" });
  });

  describe("migración desde localStorage", () => {
    it("daemon en system y caché distinta: sube la local una vez, sin pasar por system", () => {
      localStorage.setItem("amnis-theme", "dark");
      document.documentElement.dataset.theme = "dark";
      const save = okSave();
      const { result, rerender } = renderHook(({ s }) => useTheme(s, save), {
        initialProps: { s: withTheme("system") },
      });
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith({ theme: "dark" });
      expect(result.current[0]).toBe("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");

      rerender({ s: withTheme("dark") });
      expect(save).toHaveBeenCalledTimes(1);
      expect(result.current[0]).toBe("dark");
    });

    it("daemon en system y sin caché: nada que subir", () => {
      const save = okSave();
      renderHook(() => useTheme(withTheme("system"), save));
      expect(save).not.toHaveBeenCalled();
    });

    it("daemon con tema elegido y caché distinta: no sube nada", () => {
      localStorage.setItem("amnis-theme", "dark");
      const save = okSave();
      renderHook(() => useTheme(withTheme("light"), save));
      expect(save).not.toHaveBeenCalled();
      expect(localStorage.getItem("amnis-theme")).toBe("light");
    });
  });
});
