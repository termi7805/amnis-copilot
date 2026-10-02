import { useCallback, useState } from "react";

export type ThemePref = "system" | "light" | "dark";

/** `localStorage`, no `settings.json`: es una comodidad de este navegador,
 * como el panel plegado de la mascota (docs/STACK.md §3). El script inline de
 * `index.html` lee la misma clave antes de que monte React. */
const THEME_KEY = "amnis-theme";

function readPref(): ThemePref {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/** "system" no lleva atributo: sin `data-theme` decide la media query. */
function applyPref(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Sin almacenamiento el tema vale para esta sesión, nada más.
  }
}

export function useTheme(): [ThemePref, (pref: ThemePref) => void] {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const setPref = useCallback((next: ThemePref) => {
    applyPref(next);
    setPrefState(next);
  }, []);
  return [pref, setPref];
}
