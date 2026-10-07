import type { SkinsSnapshot } from "@amnis/shared";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSkin } from "../../api/skins.ts";
import { clearSkinCache, useSelectedSkin } from "./useSelectedSkin.ts";

vi.mock("../../api/skins.ts", () => ({ fetchSkin: vi.fn() }));

const summary = (id: string, errors: string[] = []) => ({
  id,
  name: null,
  states: [],
  errors,
  warnings: [],
});
const catalog = (rev: number, ...skins: SkinsSnapshot["skins"]) => ({
  rev,
  skins,
});
const loaded = (id: string) => ({
  id,
  manifest: { name: id, states: {} },
  imageUrl: (src: string) => src,
});

beforeEach(() => {
  vi.mocked(fetchSkin).mockImplementation(async (id) => loaded(id) as never);
});
afterEach(() => {
  vi.clearAllMocks();
  clearSkinCache();
});

/** El id de la skin devuelta, o el propio `null`/`"loading"`. */
const idOf = (choice: unknown) =>
  typeof choice === "object" && choice ? (choice as { id: string }).id : choice;

describe("useSelectedSkin", () => {
  it("sin skin elegida no pide nada: BIT", () => {
    const { result } = renderHook(() =>
      useSelectedSkin(null, catalog(1, summary("robi"))),
    );
    expect(result.current).toBeNull();
    expect(fetchSkin).not.toHaveBeenCalled();
  });

  it("carga la elegida con la revisión del catálogo", async () => {
    const { result } = renderHook(() =>
      useSelectedSkin("robi", catalog(7, summary("robi"))),
    );
    await waitFor(() => expect(idOf(result.current)).toBe("robi"));
    expect(fetchSkin).toHaveBeenCalledWith("robi", 7);
  });

  it("si la carpeta desaparece o se rompe vuelve a BIT, y vuelve al arreglarla", async () => {
    const { result, rerender } = renderHook(
      ({ cat }) => useSelectedSkin("robi", cat),
      { initialProps: { cat: catalog(1, summary("robi")) } },
    );
    await waitFor(() => expect(idOf(result.current)).toBe("robi"));

    rerender({ cat: catalog(2) });
    await waitFor(() => expect(result.current).toBeNull());

    rerender({ cat: catalog(3, summary("robi", ["falta la imagen"])) });
    expect(result.current).toBeNull();

    rerender({ cat: catalog(4, summary("robi")) });
    await waitFor(() => expect(idOf(result.current)).toBe("robi"));
  });

  it("si la skin no se puede cargar, BIT", async () => {
    vi.mocked(fetchSkin).mockRejectedValue(new Error("422"));
    const { result } = renderHook(() =>
      useSelectedSkin("robi", catalog(1, summary("robi"))),
    );
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("con el fetch pendiente no devuelve BIT: está cargando", async () => {
    let resolve: (skin: never) => void = () => {};
    vi.mocked(fetchSkin).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result } = renderHook(() =>
      useSelectedSkin("robi", catalog(1, summary("robi"))),
    );
    expect(result.current).toBe("loading");
    resolve(loaded("robi") as never);
    await waitFor(() => expect(idOf(result.current)).toBe("robi"));
  });

  it("una segunda instancia con la skin ya cargada la tiene en el primer render, sin otro fetch", async () => {
    const cat = catalog(1, summary("robi"));
    const first = renderHook(() => useSelectedSkin("robi", cat));
    await waitFor(() => expect(idOf(first.result.current)).toBe("robi"));

    const second = renderHook(() => useSelectedSkin("robi", cat));
    expect(idOf(second.result.current)).toBe("robi");
    expect(fetchSkin).toHaveBeenCalledTimes(1);
  });

  it("dos instancias montadas a la vez comparten un solo fetch", async () => {
    const cat = catalog(1, summary("robi"));
    const a = renderHook(() => useSelectedSkin("robi", cat));
    const b = renderHook(() => useSelectedSkin("robi", cat));
    await waitFor(() => expect(idOf(a.result.current)).toBe("robi"));
    await waitFor(() => expect(idOf(b.result.current)).toBe("robi"));
    expect(fetchSkin).toHaveBeenCalledTimes(1);
  });

  it("al cambiar la revisión sigue la versión anterior hasta que llega la nueva", async () => {
    const { result, rerender } = renderHook(
      ({ cat }) => useSelectedSkin("robi", cat),
      { initialProps: { cat: catalog(1, summary("robi")) } },
    );
    await waitFor(() => expect(idOf(result.current)).toBe("robi"));
    const before = result.current;

    let resolve: (skin: never) => void = () => {};
    vi.mocked(fetchSkin).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    rerender({ cat: catalog(2, summary("robi")) });
    expect(result.current).toBe(before);

    const next = loaded("robi");
    resolve(next as never);
    await waitFor(() => expect(result.current).toBe(next));
  });

  it("sin catálogo todavía (daemon sin responder) pinta BIT", () => {
    const { result } = renderHook(() => useSelectedSkin("robi", undefined));
    expect(result.current).toBeNull();
    expect(fetchSkin).not.toHaveBeenCalled();
  });
});
