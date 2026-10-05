import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSkin } from "./skins.ts";

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

describe("fetchSkin", () => {
  it("devuelve el manifest y resuelve las imágenes contra el daemon", async () => {
    stubFetch(200, {
      manifest: { states: { coding: { layers: [{ src: "a/b.png" }] } } },
    });
    const skin = await fetchSkin("robi");
    expect(skin.manifest.states.coding?.layers).toHaveLength(1);
    expect(skin.imageUrl("a/b.png")).toBe("/api/skins/robi/a/b.png");
  });

  it("rechaza un manifest que no valida, aunque venga del daemon", async () => {
    stubFetch(200, {
      manifest: { states: { coding: { layers: [{ src: "../fuera.png" }] } } },
    });
    await expect(fetchSkin("robi")).rejects.toThrow(/no es válida/);
  });

  it("falla con el estado HTTP si el daemon no la sirve", async () => {
    stubFetch(422, { errors: ["x"] });
    await expect(fetchSkin("rota")).rejects.toThrow(/422/);
  });
});
