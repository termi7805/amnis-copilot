import { type ThemePref, useTheme } from "../../../lib/theme.ts";
import styles from "./SettingsView.module.css";

const THEME_OPTIONS: { pref: ThemePref; label: string }[] = [
  { pref: "system", label: "Sistema" },
  { pref: "light", label: "Claro" },
  { pref: "dark", label: "Oscuro" },
];

export function AppearanceCard() {
  const [theme, setTheme] = useTheme();

  return (
    <section className={styles.card} aria-labelledby="appearance-title">
      <div className={styles.cardHead}>
        <h2 id="appearance-title">Apariencia</h2>
      </div>
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
    </section>
  );
}
