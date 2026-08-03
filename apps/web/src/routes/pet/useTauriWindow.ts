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
/* Exactamente el tamaño de `.petArea` (150×110, PetWindow.module.css) — ni
 * un píxel de chrome alrededor de BIT, la ventana es el bicho. */
export const COLLAPSED_SIZE = { width: 150, height: 110 };

/* Ancho fijo del panel 3b (BIT a 196px + texto de actividad al lado). El
 * alto NO es constante: PetWindow.tsx lo mide con `scrollHeight` tras
 * cada render y llama a `resizeWindow` con el valor real, porque el
 * número de proveedores y el ancho del countdown varían. */
export const EXPANDED_WIDTH = 320;

export function resizeWindow(width: number, height: number): void {
  if (!isTauri()) return;
  import("@tauri-apps/api/window")
    .then(
      async ({
        getCurrentWindow,
        LogicalSize,
        LogicalPosition,
        currentMonitor,
      }) => {
        const win = getCurrentWindow();
        const size = new LogicalSize(width, height);
        // GTK recalcula su propio "tamaño natural" a partir del contenido
        // en cada resize, no solo al arrancar — fijar el mínimo de Rust una
        // vez alcanzaba para plegar (110px, coincide con el contenido
        // mínimo), pero no para desplegar: sin repetir aquí el mínimo al
        // tamaño exacto que se pide, GTK deshace el `setSize()` por su
        // cuenta (medido con xwininfo: pedía 210×alto y se quedaba en
        // ~174px de ancho).
        await win.setResizable(true);
        await win.setMinSize(size);
        await win.setSize(size);

        // Plegado (150×110) cabe casi en cualquier borde; el panel
        // desplegado (320×alto variable) puede salirse de la pantalla si
        // el bicho está aparcado cerca de un borde — sin esto se veía
        // cortado en vez de reposicionarse. Solo mueve la ventana hacia
        // dentro, nunca la agranda más allá del área de trabajo.
        const monitor = await currentMonitor();
        if (!monitor) return;
        const scale = monitor.scaleFactor;
        const workAreaX = monitor.workArea.position.x / scale;
        const workAreaY = monitor.workArea.position.y / scale;
        const workAreaWidth = monitor.workArea.size.width / scale;
        const workAreaHeight = monitor.workArea.size.height / scale;

        const pos = await win.outerPosition();
        const x = pos.x / scale;
        const y = pos.y / scale;
        const maxX = workAreaX + workAreaWidth - width;
        const maxY = workAreaY + workAreaHeight - height;
        const clampedX = Math.min(x, Math.max(workAreaX, maxX));
        const clampedY = Math.min(y, Math.max(workAreaY, maxY));

        if (clampedX !== x || clampedY !== y) {
          await win.setPosition(new LogicalPosition(clampedX, clampedY));
        }
      },
    )
    // Best-effort: si el import o la llamada IPC fallan (Tauri no
    // disponible, ventana ya destruida), no hay nada sensato que hacer
    // salvo no redimensionar — mismo criterio que `set_always_on_top`
    // en main.rs, que tampoco entra en pánico si el compositor lo rechaza.
    .catch(() => {});
}
