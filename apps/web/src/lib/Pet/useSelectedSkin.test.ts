import type { SkinsSnapshot } from "@amnis/shared";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSkin } from "../../api/skins.ts";
import { useSelectedSkin } from "./useSelectedSkin.ts";

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
afterEach(() => vi.clearAllMocks());

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
    await waitFor(() => expect(result.current?.id).toBe("robi"));
    expect(fetchSkin).toHaveBeenCalledWith("robi", 7);
  });

  it("si la carpeta desaparece o se rompe vuelve a BIT, y vuelve al arreglarla", async () => {
    const { result, rerender } = renderHook(
      ({ cat }) => useSelectedSkin("robi", cat),
      { initialProps: { cat: catalog(1, summary("robi")) } },
    );
    await waitFor(() => expect(result.current?.id).toBe("robi"));

    rerender({ cat: catalog(2) });
    await waitFor(() => expect(result.current).toBeNull());

    rerender({ cat: catalog(3, summary("robi", ["falta la imagen"])) });
    expect(result.current).toBeNull();

    rerender({ cat: catalog(4, summary("robi")) });
    await waitFor(() => expect(result.current?.id).toBe("robi"));
  });

  it("si la skin no se puede cargar, BIT", async () => {
    vi.mocked(fetchSkin).mockRejectedValue(new Error("422"));
    const { result } = renderHook(() =>
      useSelectedSkin("robi", catalog(1, summary("robi"))),
    );
    await waitFor(() => expect(fetchSkin).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("sin catálogo todavía (daemon sin responder) pinta BIT", () => {
    const { result } = renderHook(() => useSelectedSkin("robi", undefined));
    expect(result.current).toBeNull();
    expect(fetchSkin).not.toHaveBeenCalled();
  });
});
