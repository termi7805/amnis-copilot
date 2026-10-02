import type { StateResponse } from "@amnis/shared";
import { fetchMediaDevices, sendMediaCommand } from "../../../api/media.ts";
import { useNow } from "../../../lib/countdown.ts";
import { MediaPlayer } from "../../../lib/MediaPlayer/MediaPlayer.tsx";
import { Pet } from "../../../lib/Pet/Pet.tsx";
import { QuotaRing } from "../QuotaRing.tsx";
import styles from "./NowView.module.css";

/** Interino: lo que ya había en la portada, hasta que #91 y #92 lo sustituyan. */
export function NowView({ state }: { state: StateResponse | null }) {
  const now = useNow();

  return (
    <>
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
    </>
  );
}
