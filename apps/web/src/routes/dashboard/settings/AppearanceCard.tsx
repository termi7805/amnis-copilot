import { PET_SCALES, type PetScale, THEMES, type ThemeId } from "@amnis/shared";
import { type KeyboardEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SaveSettingsResult } from "../../../api/settings.ts";
import styles from "./SettingsView.module.css";

/**
 * Por `scheme` del catálogo y no por origen (con nombre o propio): quien elige
 * tema piensa primero si lo quiere claro u oscuro.
 */
const GROUPS = ["system", "light", "dark"] as const;

/** Los tres del conmutador de #80: lo que se enseña plegada (#128). */
const BASIC: readonly ThemeId[] = ["system", "light", "dark"];

export interface AppearanceCardProps {
  theme: ThemeId;
  onTheme: (theme: ThemeId) => Promise<SaveSettingsResult>;
  petScale: PetScale;
  onPetScale: (scale: PetScale) => Promise<SaveSettingsResult>;
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

/** Muestra de un tema: botón de radio con su chip pintado. */
function Swatch({
  id,
  label,
  checked,
  onChoose,
}: {
  id: ThemeId;
  label: string;
  checked: boolean;
  onChoose: (id: ThemeId) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: un <input type="radio"> no puede contener la muestra pintada
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={checked ? 0 : -1}
      className={styles.swatch}
      onClick={() => onChoose(id)}
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
  );
}

/**
 * Selector de tema (#125): una muestra por tema del catálogo. «Sistema» no
 * tiene paleta propia y depende del escritorio, así que su muestra va partida
 * en claro y oscuro en vez de fingir un aspecto.
 */
export function AppearanceCard({
  theme,
  onTheme,
  petScale,
  onPetScale,
}: AppearanceCardProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  // Solo local y sin persistir: abrirla plegada en cada visita es lo que evita el desplazamiento.
  const [expanded, setExpanded] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  // Plegada, el tema activo se enseña aunque no sea de los básicos: si no, no se vería cuál
  // está puesto y el radiogroup se quedaría sin ningún botón con tabIndex 0.
  const folded = THEMES.filter((t) => BASIC.includes(t.id) || t.id === theme);

  async function choose(id: ThemeId) {
    const result = await onTheme(id);
    setError(result.ok ? null : result.message);
  }

  async function chooseScale(scale: PetScale) {
    const result = await onPetScale(scale);
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
        <h2 id="appearance-title">{t("settings.appearance.title")}</h2>
        <button
          type="button"
          className={styles.btn}
          aria-expanded={expanded}
          aria-controls="appearance-themes"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded
            ? t("settings.appearance.lessThemes")
            : t("settings.appearance.moreThemes", {
                count: THEMES.length - folded.length,
              })}
        </button>
      </div>
      <div
        id="appearance-themes"
        ref={group}
        role="radiogroup"
        aria-label={t("settings.appearance.theme")}
        onKeyDown={onKeyDown}
      >
        {expanded ? (
          GROUPS.map((scheme) => (
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
                {t(`settings.appearance.groups.${scheme}`)}
              </div>
              <div className={styles.swatches}>
                {THEMES.filter((theme) => theme.scheme === scheme).map(
                  ({ id }) => (
                    <Swatch
                      key={id}
                      id={id}
                      label={t(`settings.appearance.themes.${id}`)}
                      checked={theme === id}
                      onChoose={(t) => void choose(t)}
                    />
                  ),
                )}
              </div>
            </div>
          ))
        ) : (
          <div className={styles.swatches}>
            {folded.map(({ id }) => (
              <Swatch
                key={id}
                id={id}
                label={t(`settings.appearance.themes.${id}`)}
                checked={theme === id}
                onChoose={(t) => void choose(t)}
              />
            ))}
          </div>
        )}
      </div>
      <div className={styles.themeGroupLabel} id="pet-scale-label">
        {t("settings.appearance.petSize")}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: ídem LanguageCard, un conmutador segmentado */}
      <div
        className={styles.seg}
        role="group"
        aria-labelledby="pet-scale-label"
      >
        {PET_SCALES.map((scale) => (
          <button
            key={scale}
            type="button"
            aria-pressed={petScale === scale}
            onClick={() => void chooseScale(scale)}
          >
            {Math.round(scale * 100)} %
          </button>
        ))}
      </div>
      <p className={`${styles.muted} ${styles.footnote}`}>
        {t("settings.appearance.petSizeHint")}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
