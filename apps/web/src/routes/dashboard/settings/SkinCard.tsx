import type { PetState, SkinSummary, SkinsSnapshot } from "@amnis/shared";
import { type KeyboardEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SaveSettingsResult } from "../../../api/settings.ts";
import { reloadSkins } from "../../../api/skins.ts";
import { Pet } from "../../../lib/Pet/Pet.tsx";
import { useSelectedSkin } from "../../../lib/Pet/useSelectedSkin.ts";
import styles from "./SettingsView.module.css";
import { SkillInstall } from "./SkillInstall.tsx";

export interface SkinCardProps {
  petSkin: string | null;
  catalog: SkinsSnapshot | undefined;
  onPetSkin: (id: string | null) => Promise<SaveSettingsResult>;
}

/** El estado con que se enseña una skin: `coding` si lo pinta, si no el primero que declare. */
function previewState(skin: SkinSummary): PetState {
  return skin.states.includes("coding")
    ? "coding"
    : (skin.states[0] ?? "coding");
}

/** Miniatura con la skin cargada como la cargaría la mascota. */
function SkinThumb({
  skin,
  catalog,
}: {
  skin: SkinSummary;
  catalog: SkinsSnapshot;
}) {
  const loaded = useSelectedSkin(skin.id, catalog);
  return (
    <span className={styles.skinThumb} aria-hidden="true">
      <Pet state={previewState(skin)} level={1} fatigue={0} skin={loaded} />
    </span>
  );
}

function Option({
  checked,
  tabbable,
  disabled,
  thumb,
  name,
  errors,
  onChoose,
}: {
  checked: boolean;
  tabbable: boolean;
  disabled?: boolean;
  thumb: React.ReactNode;
  name: string;
  errors?: string[];
  onChoose: () => void;
}) {
  return (
    <div className={styles.skinOption}>
      {/* biome-ignore lint/a11y/useSemanticElements: un <input type="radio"> no puede contener la miniatura */}
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        tabIndex={tabbable ? 0 : -1}
        disabled={disabled}
        className={styles.swatch}
        onClick={onChoose}
      >
        {thumb}
        <span className={styles.swatchName}>{name}</span>
      </button>
      {errors && errors.length > 0 && (
        <ul className={styles.skinErrors}>
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Selector de skin (#158): BIT y una muestra por carpeta de `~/.amnis/skins/`.
 * Una skin con errores se lista con ellos y no se puede elegir. Si la elegida
 * desaparece o se rompe, la mascota pinta BIT y aquí se dice por qué; el ajuste
 * no se toca, para que al arreglar la carpeta vuelva sola.
 */
export function SkinCard({ petSkin, catalog, onPetSkin }: SkinCardProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const skins = catalog?.skins ?? [];
  const chosen =
    petSkin === null ? undefined : skins.find((s) => s.id === petSkin);
  const nothingChecked = petSkin !== null && chosen === undefined;

  async function choose(id: string | null) {
    const result = await onPetSkin(id);
    setError(result.ok ? null : result.message);
  }

  async function reload() {
    setReloading(true);
    try {
      await reloadSkins();
      setError(null);
    } catch {
      setError(t("common.errors.unreachable"));
    } finally {
      setReloading(false);
    }
  }

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
        '[role="radio"]:not(:disabled)',
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
    <section className={styles.card} aria-labelledby="skin-title">
      <div className={styles.cardHead}>
        <h2 id="skin-title">{t("settings.skin.title")}</h2>
        <button
          type="button"
          className={styles.btn}
          disabled={reloading}
          onClick={() => void reload()}
        >
          {t("settings.skin.reload")}
        </button>
      </div>
      <div
        ref={group}
        role="radiogroup"
        aria-label={t("settings.skin.label")}
        className={styles.swatches}
        onKeyDown={onKeyDown}
      >
        <Option
          checked={petSkin === null}
          tabbable={petSkin === null || nothingChecked}
          name={t("settings.skin.bit")}
          thumb={
            <span className={styles.skinThumb} aria-hidden="true">
              <Pet state="coding" level={1} fatigue={0} />
            </span>
          }
          onChoose={() => void choose(null)}
        />
        {catalog &&
          skins.map((skin) => {
            const broken = skin.errors.length > 0;
            return (
              <Option
                key={skin.id}
                checked={petSkin === skin.id}
                tabbable={petSkin === skin.id}
                disabled={broken}
                name={skin.name ?? skin.id}
                errors={skin.errors}
                thumb={
                  broken ? (
                    <span className={styles.skinThumb} aria-hidden="true" />
                  ) : (
                    <SkinThumb skin={skin} catalog={catalog} />
                  )
                }
                onChoose={() => void choose(skin.id)}
              />
            );
          })}
      </div>
      {petSkin !== null &&
        (chosen === undefined || chosen.errors.length > 0) && (
          <p role="status" className={styles.warn}>
            {t(
              chosen
                ? "settings.skin.brokenChosen"
                : "settings.skin.missingChosen",
              {
                id: petSkin,
              },
            )}
          </p>
        )}
      {catalog && skins.length === 0 && (
        <p className={`${styles.muted} ${styles.footnote}`}>
          {t("settings.skin.empty")}
        </p>
      )}
      <p className={`${styles.muted} ${styles.footnote}`}>
        {t("settings.skin.hint")}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <SkillInstall />
    </section>
  );
}
