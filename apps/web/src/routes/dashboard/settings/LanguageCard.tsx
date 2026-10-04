import type { LocaleId } from "@amnis/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SaveSettingsResult } from "../../../api/settings.ts";
import styles from "./SettingsView.module.css";

/** El nombre de cada idioma va en ese idioma: quien no entiende la interfaz aún tiene que encontrar el suyo. */
const OPTIONS: readonly { id: LocaleId; label?: string; lang?: string }[] = [
  { id: "system" },
  { id: "es", label: "Español", lang: "es" },
  { id: "en", label: "English", lang: "en" },
];

export interface LanguageCardProps {
  locale: LocaleId;
  onLocale: (locale: LocaleId) => Promise<SaveSettingsResult>;
}

export function LanguageCard({ locale, onLocale }: LanguageCardProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  async function choose(id: LocaleId) {
    const result = await onLocale(id);
    setError(result.ok ? null : result.message);
  }

  return (
    <section className={styles.card} aria-labelledby="language-title">
      <div className={styles.cardHead}>
        <h2 id="language-title">{t("settings.language.title")}</h2>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: un <fieldset> arrastra borde y padding del navegador a un conmutador segmentado */}
      <div
        className={styles.seg}
        role="group"
        aria-label={t("settings.language.label")}
      >
        {OPTIONS.map(({ id, label, lang }) => (
          <button
            key={id}
            type="button"
            lang={lang}
            aria-pressed={locale === id}
            onClick={() => void choose(id)}
          >
            {label ?? t("settings.language.system")}
          </button>
        ))}
      </div>
      <p className={`${styles.muted} ${styles.footnote}`}>
        {t("settings.language.hint")}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
