import type { LocaleId, StateResponse, ThemeId } from "@amnis/shared";
import { useTranslation } from "react-i18next";
import type { HealthState } from "../../../api/health.ts";
import {
  type SaveSettingsResult,
  saveSettings,
} from "../../../api/settings.ts";
import type { AmnisStream } from "../../../api/useAmnisStream.ts";
import { AppearanceCard } from "./AppearanceCard.tsx";
import { DataCard } from "./DataCard.tsx";
import { HealthList } from "./HealthList.tsx";
import { LanguageCard } from "./LanguageCard.tsx";
import { MusicSettings } from "./MusicSettings.tsx";
import { PlanCard } from "./PlanCard.tsx";
import styles from "./SettingsView.module.css";
import { UpdatesCard } from "./UpdatesCard.tsx";

export interface SettingsViewProps {
  state: StateResponse | null;
  health: HealthState;
  rebuild: AmnisStream["rebuild"];
  theme: ThemeId;
  onTheme: (theme: ThemeId) => Promise<SaveSettingsResult>;
  locale: LocaleId;
  onLocale: (locale: LocaleId) => Promise<SaveSettingsResult>;
}

/**
 * Ajustes y salud (#95): lo que hoy piden el CLI o la mascota, desde el
 * navegador. La salud ocupa la columna ancha; el plan, el tema y la caché, la
 * estrecha; la música, todo el ancho.
 */
export function SettingsView({
  state,
  health,
  rebuild,
  theme,
  onTheme,
  locale,
  onLocale,
}: SettingsViewProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.view}>
      <header className={styles.pageHead}>
        <div className={styles.eyebrow}>{t("settings.eyebrow")}</div>
        <h1>{t("settings.title")}</h1>
        <p>{t("settings.intro")}</p>
      </header>
      <div className={styles.grid}>
        <div className={styles.health}>
          <HealthList
            health={health.health}
            unreachable={health.unreachable}
            refresh={health.refresh}
            mediaStatus={state?.media.status}
          />
        </div>
        <div className={styles.side}>
          <PlanCard state={state} />
          <AppearanceCard theme={theme} onTheme={onTheme} />
          <LanguageCard locale={locale} onLocale={onLocale} />
          <DataCard rebuild={rebuild} />
          <UpdatesCard state={state} />
        </div>
        <div className={styles.music}>
          <MusicSettings settings={state?.settings} save={saveSettings} />
        </div>
      </div>
    </div>
  );
}
