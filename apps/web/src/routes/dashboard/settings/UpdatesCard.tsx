import type { StateResponse } from "@amnis/shared";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { saveSettings } from "../../../api/settings.ts";
import { Switch } from "./MusicSettings.tsx";
import styles from "./SettingsView.module.css";

/** Interruptor de la búsqueda de versiones nuevas (#148). */
export function UpdatesCard({ state }: { state: StateResponse | null }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const enabled = state?.settings.checkUpdates ?? true;

  async function toggle(checkUpdates: boolean) {
    const result = await saveSettings({ checkUpdates });
    setError(result.ok ? null : result.message);
  }

  return (
    <section className={styles.card} aria-labelledby="updates-title">
      <div className={styles.cardHead}>
        <h2 id="updates-title">{t("settings.updates.title")}</h2>
        <Switch
          label={t("settings.updates.label")}
          checked={enabled}
          onChange={(checked) => void toggle(checked)}
        />
      </div>
      {state && (
        <p className={styles.text}>
          {t("settings.updates.installed", { version: state.daemon.version })}
        </p>
      )}
      {state?.update && (
        <p className={styles.text}>
          <Trans
            i18nKey="settings.updates.available"
            values={{ version: state.update.version }}
            components={{
              // biome-ignore lint/a11y/useAnchorContent: Trans mete el texto dentro
              a: <a href={state.update.url} target="_blank" rel="noreferrer" />,
            }}
          />
        </p>
      )}
      <p className={`${styles.muted} ${styles.footnote}`}>
        {t("settings.updates.hint")}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
