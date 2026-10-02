import type { StateResponse } from "@amnis/shared";
import { saveSettings } from "../../../api/settings.ts";
import { type ThemePref, useTheme } from "../../../lib/theme.ts";
import { MusicSettings } from "../MusicSettings.tsx";
import styles from "./SettingsView.module.css";

const THEME_OPTIONS: { pref: ThemePref; label: string }[] = [
  { pref: "system", label: "Sistema" },
  { pref: "light", label: "Claro" },
  { pref: "dark", label: "Oscuro" },
];

/** Interino: tema y música; #95 añade salud, plan y caché. */
export function SettingsView({ state }: { state: StateResponse | null }) {
  const [theme, setTheme] = useTheme();

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: un <fieldset> arrastra borde y padding del navegador a un conmutador segmentado */}
      <div className={styles.themeSwitch} role="group" aria-label="Tema">
        {THEME_OPTIONS.map(({ pref, label }) => (
          <button
            key={pref}
            type="button"
            aria-pressed={theme === pref}
            onClick={() => setTheme(pref)}
          >
            {label}
          </button>
        ))}
      </div>
      <MusicSettings settings={state?.settings} save={saveSettings} />
    </>
  );
}
