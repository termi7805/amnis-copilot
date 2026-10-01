import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CONNECTION_LABEL, useAmnisStream } from "../../api/useAmnisStream.ts";
import { useNow } from "../../lib/countdown.ts";
import { Pet, PetOffline } from "../../lib/Pet/Pet.tsx";
import { MediaPanel } from "./MediaPanel.tsx";
import type { PanelId } from "./PanelHeader.tsx";
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
const PANEL_KEY = "amnis-pet-panel";
const LAST_PANEL_KEY = "amnis-pet-last-panel";
/** Clave de cuando solo había un panel (#42): "1" = desplegado. */
const LEGACY_EXPANDED_KEY = "amnis-pet-quota-panel-expanded";

type OpenPanel = PanelId;
type Panel = OpenPanel | "none";

const isOpenPanel = (v: string | null): v is OpenPanel =>
  v === "quota" || v === "media";

/** Con la clave nueva ausente, la antigua conserva la preferencia de quien
 * ya tenía el panel de cuota desplegado. */
function readPanel(): Panel {
  const stored = localStorage.getItem(PANEL_KEY);
  if (stored === "none" || isOpenPanel(stored)) return stored;
  return localStorage.getItem(LEGACY_EXPANDED_KEY) === "1" ? "quota" : "none";
}

function readLastPanel(): OpenPanel {
  const stored = localStorage.getItem(LAST_PANEL_KEY);
  return isOpenPanel(stored) ? stored : "quota";
}

/**
 * Envoltura de la mascota: viewport completo y fondo transparente
 * (docs/STACK.md §2). Arrastrar y hacer clic compiten por el mismo
 * gesto (issue #32): por debajo del umbral es un clic que pliega o
 * despliega el último panel usado (#42, #57); por encima, arrastre. El umbral se mide en
 * cualquier entorno — solo `startDragging()` queda condicionado a
 * Tauri, vía `useTauriWindow.ts` (docs/STACK.md §3).
 */
export function PetWindow() {
  const { state, status } = useAmnisStream();
  const now = useNow();
  const pointerDownAt = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);
  const windowRef = useRef<HTMLDivElement>(null);
  // Un panel u otro, nunca los dos (#57): mostrar la cuota y el reproductor
  // a la vez haría de la mascota un dashboard flotante.
  const [panel, setPanel] = useState<Panel>(readPanel);
  // El panel que abre un clic en el bicho plegado: el último que se usó.
  const [lastPanel, setLastPanel] = useState<OpenPanel>(readLastPanel);
  const expanded = panel !== "none";

  useEffect(() => {
    localStorage.setItem(PANEL_KEY, panel);
    if (panel === "none") {
      resizeWindow(COLLAPSED_SIZE.width, COLLAPSED_SIZE.height);
    } else {
      setLastPanel(panel);
      localStorage.setItem(LAST_PANEL_KEY, panel);
    }
  }, [panel]);

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
      setPanel((current) => (current === "none" ? lastPanel : "none"));
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
      data-panel={panel}
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
              resetsAt={
                state.quotas[0]?.authoritative?.fiveHour.resetsAt ?? null
              }
              commitHash={state.pet.commitHash}
            />
          ) : (
            <span>{CONNECTION_LABEL[status]}</span>
          )}
        </div>
      )}
      {panel === "quota" && state && (
        <QuotaPanel
          pet={state.pet}
          status={status}
          quotas={state.quotas}
          now={now}
          onSelectPanel={setPanel}
        />
      )}
      {panel === "media" && (
        <MediaPanel
          media={state?.media ?? null}
          status={status}
          onSelectPanel={setPanel}
        />
      )}
    </div>
  );
}
