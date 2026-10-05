import type { StateResponse } from "@amnis/shared";
import { useTranslation } from "react-i18next";
import i18n from "../../../i18n/index.ts";
import { formatElapsed } from "../../../lib/countdown.ts";
import { FocusPicker } from "../../../lib/FocusPicker/FocusPicker.tsx";
import { fatigueLevel, Pet, stateTitle } from "../../../lib/Pet/Pet.tsx";
import { useSelectedSkin } from "../../../lib/Pet/useSelectedSkin.ts";
import styles from "./PetHero.module.css";

const META_ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
} as const;

/** Etiqueta del eje de fatiga: la misma curva que mueve la mascota. */
export function fatigueLabel(fatigue: number): string {
  const level = fatigueLevel(fatigue);
  if (level < 0.34) return i18n.t("now.hero.fresh");
  if (level < 0.67) return i18n.t("now.hero.tired");
  return i18n.t("now.hero.exhausted");
}

/**
 * Amnis en grande sobre su escenario (`--stage`): está diseñada en pizarra
 * oscura y sobre el fondo oscuro del tema oscuro desaparecería. `<Pet>` no
 * cambia; el escenario es la envoltura (STACK §2).
 */
export function PetHero({ state, now }: { state: StateResponse; now: Date }) {
  const { t } = useTranslation();
  const { pet, quotas, settings } = state;
  const skin = useSelectedSkin(settings.petSkin, state.skins);
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
          othersActive={pet.othersActive}
          skin={skin}
        />
      </div>
      <div className={styles.stateLine}>
        <p className={styles.stateName}>{stateTitle(pet.state)}</p>
        {listening && (
          <span className={styles.chip}>
            {t("now.hero.headphones", {
              vibe: t(`pet.vibes.${listening.vibe}`),
            })}
            {listening.bpm !== null && ` ${Math.round(listening.bpm)} BPM`}
          </span>
        )}
      </div>
      <div className={styles.meta}>
        <span>
          <svg {...META_ICON} aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {t("now.hero.since", { elapsed: formatElapsed(pet.since, now) })}
        </span>
        {pet.project && (
          <span>
            <svg {...META_ICON} aria-hidden="true">
              <path d="M3 7h6l2 2h10v10H3z" />
            </svg>
            {pet.project}
          </span>
        )}
        <FocusPicker
          focus={pet.focus}
          now={now}
          layout="popover"
          showEnded="toggle"
        />
      </div>
      <div className={styles.fatigue}>
        <span>{t("now.hero.fatigue")}</span>
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
