import { useSyncExternalStore } from "react";

/** Los ids son las URLs (`#ahora`…): no se traducen; la etiqueta sale de `common.views`. */
export const VIEWS = ["ahora", "historico", "actividad", "ajustes"] as const;

export type View = (typeof VIEWS)[number];

/** Un hash desconocido o vacío cae en la portada, nunca en una vista en blanco. */
export function parseView(hash: string): View {
  const id = hash.replace(/^#/, "");
  return VIEWS.find((v) => v === id) ?? "ahora";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/**
 * Vista activa según `location.hash` (docs/STACK.md §2: sin router). Vive
 * dentro de la ruta `/`; `main.tsx` decide por `pathname`, así que
 * `/pet#ahora` sigue siendo la mascota.
 */
export function useHashView(): View {
  return useSyncExternalStore(subscribe, () => parseView(window.location.hash));
}
