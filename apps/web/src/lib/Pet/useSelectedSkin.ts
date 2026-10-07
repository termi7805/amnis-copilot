import type { SkinsSnapshot } from "@amnis/shared";
import { useEffect, useState } from "react";
import { fetchSkin } from "../../api/skins.ts";
import { type PetSkin, type SkinChoice, skinImageUrls } from "./SkinScene.tsx";

/** Lo más que se espera a las imágenes: una colgada no deja la mascota vacía. */
const IMAGES_TIMEOUT_MS = 3000;

interface Entry {
  rev: number | undefined;
  promise: Promise<PetSkin>;
  /** Solo cuando ya cargó (manifest e imágenes): lo que un `<Pet>` nuevo lee en su primer render. */
  skin?: PetSkin;
  /** Retenidas para que el navegador no las suelte de su caché. */
  images: HTMLImageElement[];
}

/**
 * Una entrada por skin, con la última revisión pedida: un segundo `<Pet>` o un
 * remontaje (volver a «Ahora») la encuentran sin otro `fetch`. Los fallos no se
 * guardan, así que remontar reintenta.
 */
const cache = new Map<string, Entry>();

/** Para los tests: la caché vive lo que el módulo. */
export function clearSkinCache(): void {
  cache.clear();
}

function whenLoaded(images: HTMLImageElement[]): Promise<void> {
  const loads = images.map(
    (img) =>
      new Promise<void>((resolve) => {
        img.onload = img.onerror = () => resolve();
      }),
  );
  return Promise.race([
    Promise.all(loads).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, IMAGES_TIMEOUT_MS)),
  ]);
}

function load(id: string, rev: number | undefined): Entry {
  const hit = cache.get(id);
  if (hit && hit.rev === rev) return hit;
  const entry = { rev, images: [] } as unknown as Entry;
  entry.promise = fetchSkin(id, rev).then(async (skin) => {
    entry.images = skinImageUrls(skin).map((url) => {
      const img = new Image();
      img.src = url;
      return img;
    });
    await whenLoaded(entry.images);
    entry.skin = skin;
    return skin;
  });
  entry.promise.catch(() => {
    if (cache.get(id) === entry) cache.delete(id);
  });
  cache.set(id, entry);
  return entry;
}

/**
 * La skin que hay que pintar: `null` para BIT, `"loading"` mientras llega, o
 * la skin. «Cargando» y «BIT» son estados distintos: BIT es la respuesta cuando
 * no hay skin elegida, su carpeta ya no está en el catálogo, trae errores o no
 * se puede cargar; el ajuste no se toca, así que al arreglar la carpeta vuelve
 * sola. Mientras llega la versión nueva (otro `rev`) se sigue pintando la anterior.
 */
export function useSelectedSkin(
  petSkin: string | null | undefined,
  catalog: SkinsSnapshot | undefined,
): SkinChoice {
  const [settled, setSettled] = useState<{
    id: string;
    skin: PetSkin | null;
  } | null>(null);
  const usable =
    petSkin &&
    catalog?.skins.some((s) => s.id === petSkin && s.errors.length === 0)
      ? petSkin
      : null;
  const rev = catalog?.rev;

  useEffect(() => {
    if (usable === null) {
      setSettled(null);
      return;
    }
    let stale = false;
    load(usable, rev).promise.then(
      (skin) => {
        if (!stale) setSettled({ id: usable, skin });
      },
      () => {
        if (!stale) setSettled({ id: usable, skin: null });
      },
    );
    return () => {
      stale = true;
    };
  }, [usable, rev]);

  if (usable === null) return null;
  const cached = cache.get(usable);
  if (cached?.skin && cached.rev === rev) return cached.skin;
  return settled?.id === usable ? settled.skin : "loading";
}
