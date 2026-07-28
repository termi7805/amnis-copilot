/**
 * Mismo origen por defecto: en dev Vite proxea /api, en producción el
 * daemon sirve el bundle, y Tauri carga la UI del daemon por HTTP. Solo
 * `VITE_AMNIS_URL` rompe eso, para el día del túnel (docs/DESIGN.md §1).
 */
export function daemonUrl(): string {
  return import.meta.env.VITE_AMNIS_URL ?? "";
}
