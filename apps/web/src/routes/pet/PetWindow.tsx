import { CONNECTION_LABEL, useAmnisStream } from "../../api/useAmnisStream.ts";
import { Pet } from "../../lib/Pet/Pet.tsx";
import styles from "./PetWindow.module.css";

/**
 * Envoltura de la mascota: viewport completo y fondo transparente
 * (docs/STACK.md §2). Arrastre y click-through llegan con #32; aquí el
 * indicador de desconexión (#34) — un daemon caído no puede dejar una
 * mascota que parece viva mientras miente (docs/DESIGN.md §4).
 */
export function PetWindow() {
  const { state, status } = useAmnisStream();

  return (
    <div className={styles.petWindow} data-status={status}>
      <div
        className={styles.statusDot}
        data-status={status}
        title={CONNECTION_LABEL[status]}
      />
      {state ? (
        <Pet
          state={state.pet.state}
          level={state.pet.level}
          fatigue={state.pet.fatigue}
        />
      ) : (
        <span>{CONNECTION_LABEL[status]}</span>
      )}
    </div>
  );
}
