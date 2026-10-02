import { useSyncExternalStore } from "react";

export const VIEWS = [
  { id: "ahora", label: "Ahora" },
  { id: "historico", label: "Histórico" },
  { id: "actividad", label: "Actividad" },
  { id: "ajustes", label: "Ajustes" },
] as const;

export type View = (typeof VIEWS)[number]["id"];

/** Un hash desconocido o vacío cae en la portada, nunca en una vista en blanco. */
export function parseView(hash: string): View {
  const id = hash.replace(/^#/, "");
  return VIEWS.find((v) => v.id === id)?.id ?? "ahora";
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
