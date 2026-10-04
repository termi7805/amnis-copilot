import { daemonUrl } from "../../api/config.ts";

/**
 * Único punto donde el frontend habla con Tauri (issue #42): en un
 * navegador normal `isTauri()` es `false` y `resizeWindow` no hace nada
 * — el panel se despliega igual, sin redimensionar. Import de
 * `@tauri-apps/api/core` perezoso, para no arrastrarlo fuera de Tauri.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Tamaño lógico de la ventana flotante: plegada solo el bicho, desplegada
 * con el panel de cuota debajo (#42). */
/* Exactamente el tamaño de `.petArea` (150×110, PetWindow.module.css) — ni
 * un píxel de chrome alrededor de BIT, la ventana es el bicho. */
export const COLLAPSED_SIZE = { width: 150, height: 110 };

/* Ancho fijo del panel 3b (BIT a 196px + texto de actividad al lado). El
 * alto NO es constante: PetWindow.tsx lo mide con `scrollHeight` tras
 * cada render y llama a `resizeWindow` con el valor real, porque el
 * número de proveedores y el ancho del countdown varían. */
export const EXPANDED_WIDTH = 320;

/* La posición la decide Rust (#71): solo él distingue un arrastre del
 * usuario de su propio reencaje al desplegar junto a un borde, y guarda
 * el ancla para el siguiente arranque. Por eso el arrastre también se
 * arranca desde Rust y no con `startDragging()` directo. */
export function startDrag(): void {
  if (!isTauri()) return;
  import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("start_drag"))
    .catch(() => {});
}

export function resizeWindow(width: number, height: number): void {
  if (!isTauri()) return;
  import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("resize_pet", { width, height }))
    // Best-effort: si el import o la llamada IPC fallan (Tauri no
    // disponible, ventana ya destruida), no hay nada sensato que hacer
    // salvo no redimensionar — mismo criterio que `set_always_on_top`
    // en main.rs, que tampoco entra en pánico si el compositor lo rechaza.
    .catch(() => {});
}

/* Dentro de Tauri un enlace no sale al navegador del sistema (navegaría
 * dentro del propio webview o no haría nada): lo abre el proceso nativo
 * (#131). Fuera, un `window.open` normal al dashboard del mismo origen. */
/* Menú nativo (Abrir dashboard, Salir) con el clic derecho: la ventana no
 * tiene decoraciones ni sale en la barra de tareas, y la bandeja no existe
 * en todos los escritorios. */
export function showPetMenu(): void {
  if (!isTauri()) return;
  import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("show_pet_menu"))
    .catch(() => {});
}

/* «Cerrar Amnis» del dashboard, recibido por SSE. Fuera de Tauri no hay
 * app que cerrar. */
export function quitApp(): void {
  if (!isTauri()) return;
  import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("quit_app"))
    .catch(() => {});
}

export function openDashboard(): void {
  if (!isTauri()) {
    window.open(`${daemonUrl()}/`, "_blank");
    return;
  }
  import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("open_dashboard"))
    .catch(() => {});
}
