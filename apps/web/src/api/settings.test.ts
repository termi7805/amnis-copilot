import { afterEach, describe, expect, it, vi } from "vitest";
import { saveSettings } from "./settings.ts";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("saveSettings", () => {
  it("hace PUT /api/settings con el parcial", async () => {
    const fetchMock = stubFetch(
      async () => new Response("{}", { status: 200 }),
    );
    expect(await saveSettings({ damping: 0.5 })).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/settings");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ damping: 0.5 }));
  });

  it("devuelve el error en español del 400", async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({ error: "Valor inválido", field: "damping" }),
          {
            status: 400,
          },
        ),
    );
    expect(await saveSettings({ damping: 9 })).toEqual({
      ok: false,
      message: "Valor inválido",
    });
  });

  it("cae al status si el cuerpo no es JSON", async () => {
    stubFetch(async () => new Response("boom", { status: 500 }));
    expect(await saveSettings({})).toEqual({
      ok: false,
      message: "Amnis respondió 500.",
    });
  });

  it("avisa si no se puede contactar con el daemon", async () => {
    stubFetch(async () => {
      throw new TypeError("network");
    });
    expect(await saveSettings({})).toEqual({
      ok: false,
      message: "No se pudo contactar con Amnis.",
    });
  });
});
