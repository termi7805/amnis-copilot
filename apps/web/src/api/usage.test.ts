import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUsage } from "./usage.ts";

describe("fetchUsage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("construye la URL con groupBy y el rango cuando se pasa", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ groupBy: "day", rows: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-01-08T00:00:00Z");
    await fetchUsage({ groupBy: "day", from, to });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/api/usage?");
    expect(url).toContain("groupBy=day");
    expect(url).toContain(`from=${encodeURIComponent(from.toISOString())}`);
    expect(url).toContain(`to=${encodeURIComponent(to.toISOString())}`);
  });

  it("sin from/to no los incluye en la query", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ groupBy: "project", rows: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchUsage({ groupBy: "project" });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain("from=");
    expect(url).not.toContain("to=");
  });

  it("lanza si la respuesta no es ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    await expect(fetchUsage({ groupBy: "model" })).rejects.toThrow("500");
  });
});
