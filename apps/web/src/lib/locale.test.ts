import { type AmnisSettings, DEFAULT_SETTINGS } from "@amnis/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n, { resolveLocale } from "../i18n/index.ts";
import { useLocale } from "./locale.ts";

const withLocale = (locale: AmnisSettings["locale"]): AmnisSettings => ({
  ...DEFAULT_SETTINGS,
  locale,
});

const okSave = () => vi.fn().mockResolvedValue({ ok: true });

function browserLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    value: language,
    configurable: true,
  });
}

afterEach(() => {
  browserLanguage("es-ES");
  localStorage.clear();
});

describe("resolveLocale", () => {
  it("sistema sigue al navegador: español si lo es, inglés en otro caso", () => {
    browserLanguage("es-MX");
    expect(resolveLocale("system")).toBe("es");
    browserLanguage("en-US");
    expect(resolveLocale("system")).toBe("en");
    browserLanguage("fr-FR");
    expect(resolveLocale("system")).toBe("en");
  });

  it("una elección explícita gana al navegador", () => {
    browserLanguage("en-US");
    expect(resolveLocale("es")).toBe("es");
  });
});

describe("useLocale", () => {
  it("arranca con la caché mientras no llegan los ajustes", () => {
    localStorage.setItem("amnis-locale", "en");
    const { result } = renderHook(() => useLocale(undefined, okSave()));
    expect(result.current[0]).toBe("en");
  });

  it("los ajustes del daemon ganan a la caché y la refrescan", () => {
    localStorage.setItem("amnis-locale", "es");
    const save = okSave();
    const { result } = renderHook(() => useLocale(withLocale("en"), save));
    expect(result.current[0]).toBe("en");
    expect(i18n.language).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("amnis-locale")).toBe("en");
    expect(save).not.toHaveBeenCalled();
  });

  it("con sistema no deja caché y resuelve por el navegador", () => {
    localStorage.setItem("amnis-locale", "es");
    browserLanguage("en-GB");
    renderHook(() => useLocale(withLocale("system"), okSave()));
    expect(i18n.language).toBe("en");
    expect(localStorage.getItem("amnis-locale")).toBeNull();
  });

  it("elegir un idioma lo aplica al momento y lo guarda en el daemon", () => {
    const save = okSave();
    const { result } = renderHook(() => useLocale(undefined, save));
    act(() => {
      void result.current[1]("en");
    });
    expect(result.current[0]).toBe("en");
    expect(i18n.language).toBe("en");
    expect(save).toHaveBeenCalledWith({ locale: "en" });
  });
});
