import type { SkinsSnapshot } from "@amnis/shared";
import { useEffect, useState } from "react";
import { fetchSkin } from "../../api/skins.ts";
import type { PetSkin } from "./SkinScene.tsx";

/**
 * La skin que hay que pintar, o `null` para BIT. Cae a BIT si no hay elegida,
 * si su carpeta ya no está en el catálogo, si trae errores o si no se puede
 * cargar; el ajuste no se toca, así que al arreglar la carpeta vuelve sola.
 * Mientras llega la versión nueva (otro `rev`) se sigue pintando la anterior.
 */
export function useSelectedSkin(
  petSkin: string | null | undefined,
  catalog: SkinsSnapshot | undefined,
): PetSkin | null {
  const [loaded, setLoaded] = useState<PetSkin | null>(null);
  const usable =
    petSkin &&
    catalog?.skins.some((s) => s.id === petSkin && s.errors.length === 0)
      ? petSkin
      : null;
  const rev = catalog?.rev;

  useEffect(() => {
    if (usable === null) {
      setLoaded(null);
      return;
    }
    let stale = false;
    fetchSkin(usable, rev).then(
      (skin) => {
        if (!stale) setLoaded(skin);
      },
      () => {
        if (!stale) setLoaded(null);
      },
    );
    return () => {
      stale = true;
    };
  }, [usable, rev]);

  return usable !== null && loaded?.id === usable ? loaded : null;
}
