import { existsSync, type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import type { SkinsSnapshot } from "@amnis/shared";
import { listSkins } from "../application/skins.ts";
import { skinFolder, skinIds } from "./skinFiles.ts";

export interface SkinCatalog {
  /** La última lectura; no toca el disco. */
  snapshot(): SkinsSnapshot;
  /** Relee la carpeta ya y avisa; vuelve a vigilarla si `root` no existía al arrancar. */
  reload(): SkinsSnapshot;
  stop(): void;
}

export interface SkinCatalogOptions {
  root: string;
  onChange(snapshot: SkinsSnapshot): void;
  /** Una copia de carpeta dispara decenas de eventos seguidos. */
  debounceMs?: number;
}

/**
 * Las skins instaladas, al día sin reiniciar: vigila `root` y empuja un
 * snapshot nuevo cuando algo cambia dentro, para que la mascota abierta deje
 * una skin que se acaba de borrar sin esperar a que alguien pulse nada.
 */
export function startSkinCatalog({
  root,
  onChange,
  debounceMs = 300,
}: SkinCatalogOptions): SkinCatalog {
  let rev = 0;
  let current: SkinsSnapshot = { rev, skins: [] };
  let watcher: FSWatcher | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const read = (): SkinsSnapshot => {
    rev += 1;
    current = {
      rev,
      skins: listSkins({
        skinIds: () => skinIds(root),
        folder: (id) => skinFolder(join(root, id)),
      }),
    };
    return current;
  };

  const refresh = (): void => {
    timer = null;
    onChange(read());
  };

  const attach = (): void => {
    // En Linux `watch` sobre una ruta que no existe no lanza: avisa por 'error' después.
    if (watcher || !existsSync(root)) return;
    try {
      watcher = watch(root, { recursive: true }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(refresh, debounceMs);
      });
      // Borrar `root` con el watcher puesto lo rompe: se suelta y `reload` lo reengancha.
      watcher.on("error", () => {
        watcher?.close();
        watcher = null;
        if (timer) clearTimeout(timer);
        timer = setTimeout(refresh, debounceMs);
      });
    } catch {
      // Sin `root` no hay nada que vigilar todavía.
      watcher = null;
    }
  };

  read();
  attach();

  return {
    snapshot: () => current,
    reload: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      attach();
      const snapshot = read();
      onChange(snapshot);
      return snapshot;
    },
    stop: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      watcher?.close();
      watcher = null;
    },
  };
}
