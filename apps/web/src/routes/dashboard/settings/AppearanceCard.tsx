import { THEMES, type ThemeId } from "@amnis/shared";
import { type KeyboardEvent, useRef, useState } from "react";
import type { SaveSettingsResult } from "../../../api/settings.ts";
import styles from "./SettingsView.module.css";

/**
 * Por `scheme` del catálogo y no por origen (con nombre o propio): quien elige
 * tema piensa primero si lo quiere claro u oscuro.
 */
const GROUPS = [
  { scheme: "system", title: "Sistema" },
  { scheme: "light", title: "Claros" },
  { scheme: "dark", title: "Oscuros" },
] as const;

export interface AppearanceCardProps {
  theme: ThemeId;
  onTheme: (theme: ThemeId) => Promise<SaveSettingsResult>;
}

/** Mitad de muestra: `data-theme` propio, así los tokens salen de theme.css. */
function ChipHalf({ id }: { id: ThemeId }) {
  return (
    <span className={styles.chipHalf} data-theme={id}>
      <span className={styles.chipCard}>
        <span className={styles.chipDot} />
        <span className={styles.chipInk} />
      </span>
      <span className={styles.chipBar}>
        <i style={{ background: "var(--s1)" }} />
        <i style={{ background: "var(--s2)" }} />
        <i style={{ background: "var(--warn-mark)" }} />
        <i style={{ background: "var(--crit)" }} />
      </span>
    </span>
  );
}

/**
 * Selector de tema (#125): una muestra por tema del catálogo. «Sistema» no
 * tiene paleta propia y depende del escritorio, así que su muestra va partida
 * en claro y oscuro en vez de fingir un aspecto.
 */
export function AppearanceCard({ theme, onTheme }: AppearanceCardProps) {
  const [error, setError] = useState<string | null>(null);
  const group = useRef<HTMLDivElement>(null);

  async function choose(id: ThemeId) {
    const result = await onTheme(id);
    setError(result.ok ? null : result.message);
  }

  /** Flechas entre todas las muestras, en el orden de los grupos. */
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (delta === 0) return;
    const radios = [
      ...(group.current?.querySelectorAll<HTMLButtonElement>(
        '[role="radio"]',
      ) ?? []),
    ];
    const current = radios.indexOf(e.target as HTMLButtonElement);
    const next = radios[(current + delta + radios.length) % radios.length];
    if (current === -1 || !next) return;
    e.preventDefault();
    next.focus();
    next.click();
  }

  return (
    <section className={styles.card} aria-labelledby="appearance-title">
      <div className={styles.cardHead}>
        <h2 id="appearance-title">Apariencia</h2>
      </div>
      <div
        ref={group}
        role="radiogroup"
        aria-label="Tema"
        onKeyDown={onKeyDown}
      >
        {GROUPS.map(({ scheme, title }) => (
          // biome-ignore lint/a11y/useSemanticElements: ídem, un grupo dentro del radiogroup
          <div
            key={scheme}
            className={styles.themeGroup}
            role="group"
            aria-labelledby={`theme-group-${scheme}`}
          >
            <div
              id={`theme-group-${scheme}`}
              className={styles.themeGroupLabel}
            >
              {title}
            </div>
            <div className={styles.swatches}>
              {THEMES.filter((t) => t.scheme === scheme).map(
                ({ id, label }) => (
                  // biome-ignore lint/a11y/useSemanticElements: un <input type="radio"> no puede contener la muestra pintada
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={theme === id}
                    tabIndex={theme === id ? 0 : -1}
                    className={styles.swatch}
                    onClick={() => void choose(id)}
                  >
                    <span
                      className={`${styles.chip} ${id === "system" ? styles.chipSplit : ""}`}
                      aria-hidden="true"
                    >
                      {id === "system" ? (
                        <>
                          <ChipHalf id="light" />
                          <ChipHalf id="dark" />
                        </>
                      ) : (
                        <ChipHalf id={id} />
                      )}
                    </span>
                    <span className={styles.swatchName}>{label}</span>
                  </button>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
