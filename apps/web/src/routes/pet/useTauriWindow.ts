/**
 * Único punto donde el frontend habla con Tauri (issue #42): en un
 * navegador normal `isTauri()` es `false` y `resizeWindow` no hace nada
 * — el panel se despliega igual, sin redimensionar. Import de
 * `@tauri-apps/api/window` perezoso, igual que hace `PetWindow.tsx` con
 * `startDragging` (issue #32), para no arrastrarlo fuera de Tauri.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Tamaño lógico de la ventana flotante: plegada solo el bicho, desplegada
 * con el panel de cuota debajo (#42). */
export const COLLAPSED_SIZE = { width: 140, height: 140 };
export const EXPANDED_SIZE = { width: 300, height: 260 };

export function resizeWindow(width: number, height: number): void {
  if (!isTauri()) return;
  import("@tauri-apps/api/window").then(({ getCurrentWindow, LogicalSize }) => {
    getCurrentWindow().setSize(new LogicalSize(width, height));
  });
}
