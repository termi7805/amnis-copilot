import type { UpdateInfo } from "@amnis/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./UpdateBanner.module.css";

const DISMISSED_KEY = "amnis.dismissedUpdate";

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * Aviso de versión nueva (#148). Se descarta por versión: si sale otra más
 * nueva, vuelve a aparecer.
 */
export function UpdateBanner({ update }: { update: UpdateInfo | null }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!update || dismissed === update.version) return null;

  function dismiss(version: string) {
    try {
      localStorage.setItem(DISMISSED_KEY, version);
    } catch {}
    setDismissed(version);
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
