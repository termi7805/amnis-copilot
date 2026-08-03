import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CONNECTION_LABEL, useAmnisStream } from "../../api/useAmnisStream.ts";
import { useNow } from "../../lib/countdown.ts";
import { Pet, PetOffline } from "../../lib/Pet/Pet.tsx";
import styles from "./PetWindow.module.css";
import { QuotaPanel } from "./QuotaPanel.tsx";
import {
  COLLAPSED_SIZE,
  EXPANDED_WIDTH,
  isTauri,
  resizeWindow,
} from "./useTauriWindow.ts";

/** Antes de esto, un pointerdown es un futuro clic, no un arrastre. */
const DRAG_THRESHOLD_PX = 10;

/** `localStorage`, no SQLite (issue #42): la BD se borra con
 * `amnis ingest --rebuild`, y perder un ajuste de UI al reconstruir
 * datos es un bug difícil de atribuir. */
const EXPANDED_KEY = "amnis-pet-quota-panel-expanded";

/**
 * Envoltura de la mascota: viewport completo y fondo transparente
 * (docs/STACK.md §2). Arrastrar y hacer clic compiten por el mismo
 * gesto (issue #32): por debajo del umbral es un clic que alterna el
 * panel de cuota (#42); por encima, arrastre. El umbral se mide en
 * cualquier entorno — solo `startDragging()` queda condicionado a
 * Tauri, vía `useTauriWindow.ts` (docs/STACK.md §3).
 */
export function PetWindow() {
  const { state, status } = useAmnisStream();
  const now = useNow();
  const pointerDownAt = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);
  const windowRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(EXPANDED_KEY) === "1",
  );

  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, expanded ? "1" : "0");
    if (!expanded) {
      resizeWindow(COLLAPSED_SIZE.width, COLLAPSED_SIZE.height);
    }
  }, [expanded]);

  // Desplegada, el alto real depende de cuántos proveedores hay y de
  // si el countdown envuelve a dos líneas — una constante fija recorta
  // el porcentaje con el `overflow: hidden` de `.petWindow` en cuanto
  // el contenido real es más alto que la adivinanza. `ResizeObserver`
  // remide cada vez que el contenido cambia de tamaño por cualquier
  // motivo (proveedores, texto, fuentes), en vez de adivinar qué
  // dependencias de React lo disparan.
  useLayoutEffect(() => {
    if (!expanded || !windowRef.current) return;
    const el = windowRef.current;

    const measure = () => resizeWindow(EXPANDED_WIDTH, el.scrollHeight);
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);

  function handlePointerDown(e: React.PointerEvent) {
    pointerDownAt.current = { x: e.clientX, y: e.clientY };
    dragStarted.current = false;
  }

  function handlePointerMove(e: React.PointerEvent) {
    const start = pointerDownAt.current;
    if (!start || dragStarted.current || !isTauri()) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

    dragStarted.current = true;
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => {
        getCurrentWindow().startDragging();
      })
      .catch(() => {});
  }

  function handlePointerUp() {
    if (!dragStarted.current) {
      setExpanded((current) => !current);
    }
    pointerDownAt.current = null;
    dragStarted.current = false;
  }

  return (
    <div
      ref={windowRef}
      className={styles.petWindow}
      data-status={status}
      data-expanded={expanded}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {!expanded && (
        <div className={styles.petArea}>
          {status === "offline" ? (
            <PetOffline />
          ) : state ? (
            <Pet
              state={state.pet.state}
              level={state.pet.level}
              fatigue={state.pet.fatigue}
            />
          ) : (
            <span>{CONNECTION_LABEL[status]}</span>
          )}
        </div>
      )}
      {expanded && state && (
        <QuotaPanel
          pet={state.pet}
          status={status}
          quotas={state.quotas}
          now={now}
        />
      )}
    </div>
  );
}
