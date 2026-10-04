import { useTranslation } from "react-i18next";
import {
  formatMinutes,
  groupOf,
  type StateRow,
} from "../../../lib/activity.ts";
import { Pet, stateTitle } from "../../../lib/Pet/Pet.tsx";
import styles from "./ActivityView.module.css";

/**
 * Tiempo por estado, con la escena de `<Pet>` como leyenda: el bicho que
 * ves trabajar es el icono de la barra. `waiting` lleva el mismo rayado que
 * la línea del día (clase `.hatchBar`), no solo color.
 */
export function StateBreakdown({ rows }: { rows: StateRow[] }) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return <p className={styles.empty}>{t("activity.noActivity")}</p>;
  }
  const max = rows[0]?.minutes ?? 1;
  return (
    <div className={styles.states}>
      {rows.map(({ state, minutes }) => {
        const group = groupOf(state);
        return (
          <div key={state} className={styles.stateRow} data-testid="state-row">
            <div className={styles.mini} aria-hidden="true">
              <Pet state={state} level={1} fatigue={0} />
            </div>
            <span>{stateTitle(state)}</span>
            <div className={styles.bar}>
              <i
                className={group === "waiting" ? styles.hatchBar : undefined}
                style={{
                  width: `${(minutes / max) * 100}%`,
                  background:
                    group === "waiting"
                      ? undefined
                      : `var(--act-${group === "working" ? "work" : "explore"})`,
                }}
              />
            </div>
            <span className={styles.n} data-testid="state-minutes">
              {formatMinutes(minutes)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
