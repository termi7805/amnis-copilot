import type { MusicPrefs, PetSnapshot } from "@amnis/shared";
import type { ConnectionStatus } from "../../api/useAmnisStream.ts";
import { formatElapsed } from "../../lib/countdown.ts";
import { Pet, PetOffline, STATE_TITLE } from "../../lib/Pet/Pet.tsx";
import styles from "./ActivityRow.module.css";

export interface ActivityRowProps {
  pet: PetSnapshot;
  status: ConnectionStatus;
  resetsAt: string | null;
  now: Date;
  musicPrefs?: MusicPrefs;
}

export function ActivityRow({
  pet,
  status,
  resetsAt,
  now,
  musicPrefs,
}: ActivityRowProps) {
  return (
    <div className={styles.activity}>
      <div className={styles.activityPet}>
        {status === "offline" ? (
          <PetOffline />
        ) : (
          <Pet
            state={pet.state}
            level={pet.level}
            fatigue={pet.fatigue}
            resetsAt={resetsAt}
            commitHash={pet.commitHash}
            listening={pet.listening}
            musicPrefs={musicPrefs}
            othersActive={pet.othersActive}
          />
        )}
      </div>
      <div className={styles.activityText}>
        <span className={styles.cap}>Ahora</span>
        <span className={styles.activityLabel} data-testid="activity-label">
          {STATE_TITLE[pet.state]}
        </span>
        <span
          className={styles.activityDuration}
          data-testid="activity-duration"
        >
          {formatElapsed(pet.since, now)}
        </span>
      </div>
    </div>
  );
}
