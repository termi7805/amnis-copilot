import type { UpdateInfo } from "@amnis/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { saveSettings } from "../../api/settings.ts";
import styles from "./UpdateBanner.module.css";

/**
 * Aviso de versión nueva (#148). Descartar lo guarda el daemon (#149), así
 * se oculta también en la mascota y la bandeja; solo para esa versión.
 */
export function UpdateBanner({ update }: { update: UpdateInfo | null }) {
  const { t } = useTranslation();
  // Se oculta sin esperar al evento `settings` que lo confirma.
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!update || dismissed === update.version) return null;

  function dismiss(version: string) {
    setDismissed(version);
    void saveSettings({ dismissedUpdate: version });
  }

  return (
    <aside className={styles.banner} role="status">
      <span>{t("common.update.available", { version: update.version })}</span>
      <a href={update.url} target="_blank" rel="noreferrer">
        {t("common.update.notes")} ↗
      </a>
      <button
        type="button"
        className={styles.dismiss}
        aria-label={t("common.update.dismiss")}
        title={t("common.update.dismiss")}
        onClick={() => dismiss(update.version)}
      >
        ✕
      </button>
    </aside>
  );
}
