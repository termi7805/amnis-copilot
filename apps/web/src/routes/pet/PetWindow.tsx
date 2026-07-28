import { useAmnisStream } from "../../api/useAmnisStream.ts";
import { Pet } from "../../lib/Pet/Pet.tsx";
import styles from "./PetWindow.module.css";

/**
 * Envoltura de la mascota: viewport completo y fondo transparente
 * (docs/STACK.md §2). Arrastre, click-through y el panel de cuota
 * llegan con #32/#34; aquí solo el sitio donde encajan.
 */
export function PetWindow() {
  const { state, connected } = useAmnisStream();

  return (
    <div className={styles.petWindow}>
      {state ? (
        <Pet
          state={state.pet.state}
          level={state.pet.level}
          fatigue={state.pet.fatigue}
        />
      ) : (
        <span>{connected ? "…" : "desconectado"}</span>
      )}
    </div>
  );
}
