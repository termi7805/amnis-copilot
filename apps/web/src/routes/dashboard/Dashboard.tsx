import { fetchMediaDevices, sendMediaCommand } from "../../api/media.ts";
import { saveSettings } from "../../api/settings.ts";
import { CONNECTION_LABEL, useAmnisStream } from "../../api/useAmnisStream.ts";
import { useNow } from "../../lib/countdown.ts";
import { MediaPlayer } from "../../lib/MediaPlayer/MediaPlayer.tsx";
import { Pet } from "../../lib/Pet/Pet.tsx";
import { type ThemePref, useTheme } from "../../lib/theme.ts";
import styles from "./Dashboard.module.css";
import { MusicSettings } from "./MusicSettings.tsx";
import { QuotaRing } from "./QuotaRing.tsx";
import { Usage } from "./Usage.tsx";

/**
 * Envoltura del dashboard: tarjeta ~160px junto a los anillos de cuota
 * (docs/STACK.md §2), la tarjeta del reproductor (#58) y la vista histórica de tokens/coste debajo (#31).
 */
const THEME_OPTIONS: { pref: ThemePref; label: string }[] = [
  { pref: "system", label: "Sistema" },
  { pref: "light", label: "Claro" },
  { pref: "dark", label: "Oscuro" },
];

export function Dashboard() {
  const [theme, setTheme] = useTheme();
  const { state, status } = useAmnisStream();
  const now = useNow();

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <h1 className={styles.logo}>Amnis</h1>
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
      </header>
      <div className={styles.petCard}>
        {state ? (
          <Pet
            state={state.pet.state}
            level={state.pet.level}
            fatigue={state.pet.fatigue}
            resetsAt={state.quotas[0]?.authoritative?.fiveHour.resetsAt ?? null}
            commitHash={state.pet.commitHash}
            listening={state.pet.listening}
            musicPrefs={state.settings}
          />
        ) : (
          <span>conectando…</span>
        )}
      </div>
      <p data-testid="connection-status">{CONNECTION_LABEL[status]}</p>
      <div className={styles.overview}>
        {state?.quotas.map((quota) => (
          <div key={quota.provider} className={styles.quotas}>
            {quota.error && <p className={styles.quotaError}>{quota.error}</p>}
            <QuotaRing
              label="5h"
              authoritative={quota.authoritative?.fiveHour ?? null}
              estimated={quota.local.fiveHourUtilization}
              now={now}
            />
            <QuotaRing
              label="7d"
              authoritative={quota.authoritative?.sevenDay ?? null}
              estimated={null}
              now={now}
            />
            {quota.authoritative?.sevenDayOpus && (
              <QuotaRing
                label="7d Opus"
                authoritative={quota.authoritative.sevenDayOpus}
                estimated={null}
                now={now}
              />
            )}
          </div>
        ))}
        <div className={styles.mediaCard}>
          <MediaPlayer
            layout="wide"
            media={state?.media ?? null}
            onCommand={sendMediaCommand}
            loadDevices={fetchMediaDevices}
          />
        </div>
      </div>
      <MusicSettings settings={state?.settings} save={saveSettings} />
      <Usage />
      <pre>{state ? JSON.stringify(state, null, 2) : null}</pre>
    </main>
  );
}
