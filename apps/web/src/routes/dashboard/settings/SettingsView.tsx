import type { StateResponse, ThemeId } from "@amnis/shared";
import type { HealthState } from "../../../api/health.ts";
import {
  type SaveSettingsResult,
  saveSettings,
} from "../../../api/settings.ts";
import type { AmnisStream } from "../../../api/useAmnisStream.ts";
import { AppearanceCard } from "./AppearanceCard.tsx";
import { DataCard } from "./DataCard.tsx";
import { HealthList } from "./HealthList.tsx";
import { MusicSettings } from "./MusicSettings.tsx";
import { PlanCard } from "./PlanCard.tsx";
import styles from "./SettingsView.module.css";

export interface SettingsViewProps {
  state: StateResponse | null;
  health: HealthState;
  rebuild: AmnisStream["rebuild"];
  theme: ThemeId;
  onTheme: (theme: ThemeId) => Promise<SaveSettingsResult>;
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
}: SettingsViewProps) {
  return (
    <div className={styles.view}>
      <header className={styles.pageHead}>
        <div className={styles.eyebrow}>
          Lo mismo que amnis doctor, sin abrir la terminal
        </div>
        <h1>Ajustes y salud</h1>
        <p>Todo lo que hoy pide CLI o la mascota se hace desde aquí.</p>
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
          <DataCard rebuild={rebuild} />
        </div>
        <div className={styles.music}>
          <MusicSettings settings={state?.settings} save={saveSettings} />
        </div>
      </div>
    </div>
  );
}
