import type { StateResponse } from "@amnis/shared";
import { formatElapsed } from "../../../lib/countdown.ts";
import { fatigueLevel, Pet, STATE_TITLE } from "../../../lib/Pet/Pet.tsx";
import styles from "./PetHero.module.css";

/** Etiqueta del eje de fatiga: la misma curva que mueve la mascota. */
export function fatigueLabel(fatigue: number): string {
  const level = fatigueLevel(fatigue);
  if (level < 0.34) return "fresca";
  if (level < 0.67) return "cansada";
  return "agotada";
}

/**
 * Amnis en grande sobre su escenario (`--stage`): está diseñada en pizarra
 * oscura y sobre el fondo oscuro del tema oscuro desaparecería. `<Pet>` no
 * cambia; el escenario es la envoltura (STACK §2).
 */
export function PetHero({ state, now }: { state: StateResponse; now: Date }) {
  const { pet, quotas, settings } = state;
  const listening = pet.listening;
  const percent = Math.round(pet.fatigue * 100);

  return (
    <article className={styles.hero}>
      <div className={styles.stage} data-testid="pet-stage">
        <Pet
          state={pet.state}
          level={pet.level}
          fatigue={pet.fatigue}
          resetsAt={quotas[0]?.authoritative?.fiveHour.resetsAt ?? null}
          commitHash={pet.commitHash}
          listening={listening}
          musicPrefs={settings}
        />
      </div>
      <div className={styles.stateLine}>
        <p className={styles.stateName}>{STATE_TITLE[pet.state]}</p>
        {listening && (
          <span className={styles.chip}>
            con cascos · {listening.vibe}
            {listening.bpm !== null && ` ${Math.round(listening.bpm)} BPM`}
          </span>
        )}
      </div>
      <p className={styles.meta}>
        <span>desde hace {formatElapsed(pet.since, now)}</span>
        {pet.project && <span>{pet.project}</span>}
      </p>
      <div className={styles.fatigue}>
        <span>Fatiga</span>
        <div className={styles.bar}>
          <i style={{ left: `${Math.min(100, percent)}%` }} />
        </div>
        <span className={styles.mono}>
          {percent} % · {fatigueLabel(pet.fatigue)}
        </span>
      </div>
    </article>
  );
}
