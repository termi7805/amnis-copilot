import type { PetSnapshot } from "@amnis/shared";
import styles from "./Pet.module.css";

export interface PetProps {
  state: PetSnapshot["state"];
  level: number;
  fatigue: number;
}

/**
 * Placeholder de la issue #33: fija el contrato de docs/STACK.md §2, no
 * el arte. Escala a su contenedor y no lleva fondo, marco ni tamaño
 * propio — eso vive en las envolturas de routes/.
 */
export function Pet({ state, level, fatigue }: PetProps) {
  return (
    <div
      className={styles.pet}
      data-testid="pet"
      data-state={state}
      data-level={level}
    >
      <span className={styles.label}>{state}</span>
      <span className={styles.fatigue}>{Math.round(fatigue * 100)}%</span>
    </div>
  );
}
