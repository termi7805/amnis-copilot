import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchMediaDevices,
  type MediaCommand,
  sendMediaCommand,
  useRefreshMediaOnFocus,
} from "./media.ts";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendMediaCommand", () => {
  it.each<[MediaCommand, string]>([
    ["play", "/api/media/play"],
    ["pause", "/api/media/pause"],
    ["next", "/api/media/next"],
    ["previous", "/api/media/previous"],
    ["connect", "/api/spotify/login"],
  ])("%s hace POST a %s", async (command, path) => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(sendMediaCommand(command)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(path), {
      method: "POST",
    });
  });

  it("seek hace POST a /api/media/seek con positionMs entero en el body", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(
      sendMediaCommand({ kind: "seek", positionMs: 42_000.6 }),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/media/seek"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionMs: 42_001 }),
      },
    );
  });

  it("transfer hace POST a /api/media/transfer con el deviceId en el body", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(
      sendMediaCommand({ kind: "transfer", deviceId: "movil" }),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/media/transfer"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "movil" }),
      },
    );
  });

  it("un 409 con el texto del daemon lo devuelve tal cual", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: "Abre Spotify en algún dispositivo.", kind: "no-device" },
        { status: 409 },
      ),
    );
    await expect(sendMediaCommand("pause")).resolves.toEqual({
      ok: false,
      message: "Abre Spotify en algún dispositivo.",
    });
  });

  it("un 401 incluye el remedio", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: "Sin sesión de Spotify.", remedy: "amnis spotify login" },
        { status: 401 },
      ),
    );
    await expect(sendMediaCommand("play")).resolves.toEqual({
      ok: false,
      message: "Sin sesión de Spotify.",
      remedy: "amnis spotify login",
    });
  });

  it("un cuerpo que no es JSON da un mensaje con el status", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 502 }));
    await expect(sendMediaCommand("next")).resolves.toEqual({
      ok: false,
      message: "Spotify respondió 502.",
    });
  });

  it("si fetch lanza, un mensaje de red y no una excepción", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(sendMediaCommand("previous")).resolves.toEqual({
      ok: false,
      message: "No se pudo contactar con Amnis.",
    });
  });
});

describe("fetchMediaDevices", () => {
  it("pide GET /api/media/devices y devuelve la lista", async () => {
    const devices = [
      {
        id: "a",
        name: "PC",
        type: "Computer",
        isActive: true,
        isRestricted: false,
      },
    ];
    fetchMock.mockResolvedValue(Response.json({ devices }));
    await expect(fetchMediaDevices()).resolves.toEqual({ ok: true, devices });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/media/devices"),
    );
  });

  it("un error del daemon se devuelve con su texto", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: "Spotify no responde." }, { status: 502 }),
    );
    await expect(fetchMediaDevices()).resolves.toEqual({
      ok: false,
      message: "Spotify no responde.",
    });
  });

  it("si fetch lanza, un mensaje de red y no una excepción", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchMediaDevices()).resolves.toEqual({
      ok: false,
      message: "No se pudo contactar con Amnis.",
    });
  });
});

describe("useRefreshMediaOnFocus", () => {
  function setVisibility(value: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", {
      value,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response("{}"));
    setVisibility("visible");
    fetchMock.mockClear();
  });

  afterEach(() => {
    // Sin esto los hooks de tests anteriores siguen escuchando `focus` y
    // duplican las llamadas (aquí no hay auto-cleanup).
    cleanup();
    vi.useRealTimers();
  });

  const refreshCalls = () =>
    fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/media/refresh"),
    );

  it("al recuperar el foco la ventana, avisa al daemon con un POST", () => {
    renderHook(() => useRefreshMediaOnFocus());
    window.dispatchEvent(new Event("focus"));
    expect(refreshCalls()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/media/refresh"),
      { method: "POST" },
    );
  });

  it("al volverse visible la pestaña avisa; al ocultarse, no", () => {
    renderHook(() => useRefreshMediaOnFocus());
    fetchMock.mockClear();
    setVisibility("hidden");
    expect(refreshCalls()).toHaveLength(0);
    setVisibility("visible");
    expect(refreshCalls()).toHaveLength(1);
  });

  it("foco y visibilidad juntos cuentan como uno; pasado el margen, otro", () => {
    renderHook(() => useRefreshMediaOnFocus());
    fetchMock.mockClear();
    window.dispatchEvent(new Event("focus"));
    setVisibility("visible");
    expect(refreshCalls()).toHaveLength(1);
    vi.advanceTimersByTime(2_100);
    window.dispatchEvent(new Event("focus"));
    expect(refreshCalls()).toHaveLength(2);
  });

  it("al desmontar deja de escuchar", () => {
    const { unmount } = renderHook(() => useRefreshMediaOnFocus());
    unmount();
    fetchMock.mockClear();
    window.dispatchEvent(new Event("focus"));
    setVisibility("visible");
    expect(refreshCalls()).toHaveLength(0);
  });

  it("si el daemon no responde, no lanza", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderHook(() => useRefreshMediaOnFocus());
    expect(() => window.dispatchEvent(new Event("focus"))).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
  });
});
