import { type SkinSummary, validateSkinManifest } from "@amnis/shared";
import type { PetSkin } from "../lib/Pet/SkinScene.tsx";
import { daemonUrl } from "./config.ts";

export async function fetchSkins(): Promise<SkinSummary[]> {
  const response = await fetch(`${daemonUrl()}/api/skins`);
  if (!response.ok) throw new Error(`GET /api/skins → ${response.status}`);
  return response.json();
}

/**
 * El manifest llega por la red: se revalida aquí y nada sin validar llega a
 * `<Pet>`. Las rutas de imagen ya cumplen `skinPathProblem`, así que solo se
 * codifica cada segmento.
 */
export async function fetchSkin(id: string): Promise<PetSkin> {
  const base = `${daemonUrl()}/api/skins/${encodeURIComponent(id)}`;
  const response = await fetch(base);
  if (!response.ok)
    throw new Error(`GET /api/skins/${id} → ${response.status}`);
  const body: { manifest?: unknown } = await response.json();
  const checked = validateSkinManifest(body.manifest);
  if ("errors" in checked) {
    throw new Error(`La skin ${id} no es válida: ${checked.errors.join("; ")}`);
  }
  return {
    id,
    manifest: checked.manifest,
    imageUrl: (src) =>
      `${base}/${src.split("/").map(encodeURIComponent).join("/")}`,
  };
}
