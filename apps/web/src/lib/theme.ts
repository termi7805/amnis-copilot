import { type AmnisSettings, isThemeId, type ThemeId } from "@amnis/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveSettings } from "../api/settings.ts";

/**
 * Caché de primer pintado, nunca fuente de verdad (#121): el tema vive en
 * `settings.json` del daemon porque la ventana Tauri y el navegador no
 * comparten `localStorage`. El script inline de `index.html` lee esta clave
 * antes de que monte React y exista el SSE; sin ella cada carga pintaría el
 * tema por defecto y luego saltaría.
 */
const THEME_KEY = "amnis-theme";

function readCache(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return isThemeId(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/** "system" no lleva atributo: sin `data-theme` decide la media query. */
function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Sin almacenamiento solo se pierde el primer pintado de la próxima carga.
  }
}

/**
 * El tema activo, tomado de los ajustes del daemon: cuando llegan, gana el
 * daemon. Elegir uno lo aplica al momento y lo guarda por `PUT /api/settings`;
 * el SSE lo reparte al resto de clientes.
 *
 * Migración (#80 → #121): quien ya tenía `amnis-theme` y un `settings.json`
 * sin `theme` recibe el valor por defecto; en ese caso se sube su elección
 * local una sola vez en vez de pisarla.
 */
export function useTheme(
  settings: AmnisSettings | undefined,
  save: typeof saveSettings = saveSettings,
): [ThemeId, (theme: ThemeId) => void] {
  const [theme, setThemeState] = useState<ThemeId>(readCache);
  const migrationChecked = useRef(false);
  const daemonTheme = settings?.theme;

  useEffect(() => {
    if (daemonTheme === undefined) return;
    if (!migrationChecked.current) {
      migrationChecked.current = true;
      const local = readCache();
      if (daemonTheme === "system" && local !== "system") {
        void save({ theme: local });
        return;
      }
    }
    applyTheme(daemonTheme);
    setThemeState(daemonTheme);
  }, [daemonTheme, save]);

  const setTheme = useCallback(
    (next: ThemeId) => {
      applyTheme(next);
      setThemeState(next);
      void save({ theme: next });
    },
    [save],
  );
  return [theme, setTheme];
}
