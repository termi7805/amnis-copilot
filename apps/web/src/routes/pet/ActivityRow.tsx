import type { MusicPrefs, PetSnapshot } from "@amnis/shared";
import { useTranslation } from "react-i18next";
import type { ConnectionStatus } from "../../api/useAmnisStream.ts";
import { formatElapsed } from "../../lib/countdown.ts";
import { Pet, PetOffline, stateTitle } from "../../lib/Pet/Pet.tsx";
import type { PetSkin } from "../../lib/Pet/SkinScene.tsx";
import styles from "./ActivityRow.module.css";

export interface ActivityRowProps {
  pet: PetSnapshot;
  status: ConnectionStatus;
  resetsAt: string | null;
  now: Date;
  musicPrefs?: MusicPrefs;
  /** Color de identidad de la sesión que se ve (foco «Todas»). */
  identity?: number;
  /** La skin que ya resolvió `PetWindow`; sin ella (o `null`) pinta BIT. */
  skin?: PetSkin | null;
}

export function ActivityRow({
  pet,
  status,
  resetsAt,
  now,
  musicPrefs,
  identity,
  skin,
}: ActivityRowProps) {
  const { t } = useTranslation();
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
            identity={identity}
            skin={skin}
          />
        )}
      </div>
      <div className={styles.activityText}>
        <span className={styles.cap}>{t("pet.window.now")}</span>
        <span className={styles.activityLabel} data-testid="activity-label">
          {stateTitle(pet.state)}
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
