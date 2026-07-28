import { useRef } from "react";
import { CONNECTION_LABEL, useAmnisStream } from "../../api/useAmnisStream.ts";
import { Pet } from "../../lib/Pet/Pet.tsx";
import styles from "./PetWindow.module.css";

/** Antes de esto, un pointerdown es un futuro clic, no un arrastre. */
const DRAG_THRESHOLD_PX = 4;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Envoltura de la mascota: viewport completo y fondo transparente
 * (docs/STACK.md §2). Arrastrar y hacer clic compiten por el mismo
 * gesto (issue #32): por debajo del umbral no pasa nada — todavía no
 * hay panel que abrir (#42), así que no hay handler de clic
 * especulativo, solo el mecanismo de umbral que #42 reusará. Import de
 * `@tauri-apps/api/window` perezoso y solo dentro de Tauri
 * (docs/STACK.md §3): en un navegador normal esto no hace nada.
 */
export function PetWindow() {
  const { state, status } = useAmnisStream();
  const pointerDownAt = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);

  function handlePointerDown(e: React.PointerEvent) {
    if (!isTauri()) return;
    pointerDownAt.current = { x: e.clientX, y: e.clientY };
    dragStarted.current = false;
  }

  function handlePointerMove(e: React.PointerEvent) {
    const start = pointerDownAt.current;
    if (!start || dragStarted.current) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

    dragStarted.current = true;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow().startDragging();
    });
  }

  function handlePointerUp() {
    pointerDownAt.current = null;
    dragStarted.current = false;
  }

  return (
    <div
      className={styles.petWindow}
      data-status={status}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
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
