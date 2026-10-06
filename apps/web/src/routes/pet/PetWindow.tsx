import {
  isPetScale,
  type PetScale,
  type PetSnapshot,
  pendingUpdate,
  type SessionPet,
} from "@amnis/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHealth } from "../../api/health.ts";
import { useAmnisStream } from "../../api/useAmnisStream.ts";
import { useNow } from "../../lib/countdown.ts";
import { useLocale } from "../../lib/locale.ts";
import { Pet, PetOffline } from "../../lib/Pet/Pet.tsx";
import { useSelectedSkin } from "../../lib/Pet/useSelectedSkin.ts";
import {
  useCarouselKeys,
  useSessionCarousel,
} from "../../lib/SessionCarousel/SessionCarousel.tsx";
import { useTheme } from "../../lib/theme.ts";
import { HooksAlert } from "./HooksAlert.tsx";
import { MediaPanel } from "./MediaPanel.tsx";
import type { PanelId } from "./PanelHeader.tsx";
import styles from "./PetWindow.module.css";
import { QuotaPanel } from "./QuotaPanel.tsx";
import {
  collapsedSize,
  EXPANDED_WIDTH,
  isTauri,
  quitApp,
  resizeWindow,
  setUpdateMenu,
  showPetMenu,
  startDrag,
} from "./useTauriWindow.ts";

/** Antes de esto, un pointerdown es un futuro clic, no un arrastre. */
const DRAG_THRESHOLD_PX = 10;

/** `localStorage`, no SQLite (issue #42): la BD se reconstruye
 * con `amnis ingest --rebuild`, y perder un ajuste de UI al reconstruir
 * datos es un bug difícil de atribuir. */
const PANEL_KEY = "amnis-pet-panel";
const LAST_PANEL_KEY = "amnis-pet-last-panel";
/** Solo caché de arranque de la escala: la fuente de verdad es el daemon. Sin
 * ella la ventana encogería a 150×110 hasta que llegue el primer SSE. */
const SCALE_KEY = "amnis-pet-scale";
/** Preferencia anterior a #57: "1" = cuota desplegada. */
const LEGACY_EXPANDED_KEY = "amnis-pet-quota-panel-expanded";

type OpenPanel = PanelId;
type Panel = OpenPanel | "none";

const NO_SESSIONS: SessionPet[] = [];

const isOpenPanel = (v: string | null): v is OpenPanel =>
  v === "quota" || v === "media";

/** Sin la clave nueva, la antigua conserva el panel de cuota desplegado. */
function readPanel(): Panel {
  const stored = localStorage.getItem(PANEL_KEY);
  if (stored === "none" || isOpenPanel(stored)) return stored;
  return localStorage.getItem(LEGACY_EXPANDED_KEY) === "1" ? "quota" : "none";
}

function readScale(): PetScale {
  const stored = Number(localStorage.getItem(SCALE_KEY));
  return isPetScale(stored) ? stored : 1;
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
 * cualquier entorno — solo `startDrag()` queda condicionado a
 * Tauri, vía `useTauriWindow.ts` (docs/STACK.md §3).
 */
export function PetWindow() {
  const { state, status, quitRequested } = useAmnisStream();
  const now = useNow();
  // Al cambiar la conexión se vuelve a preguntar: tras reconectar no hay que
  // esperar al minuto del sondeo.
  const health = useHealth(status);
  // Solo recibe: el tema se elige en el dashboard y llega por SSE (#121).
  useTheme(state?.settings);
  useLocale(state?.settings);
  const skin = useSelectedSkin(state?.settings.petSkin, state?.skins);
  // `sessions` solo trae lista con el foco en «Todas»: fuera de él, o sin
  // sesiones vivas, `current` es `null` y se ve la mascota de siempre.
  const carousel = useSessionCarousel(state?.pet.sessions ?? NO_SESSIONS);
  const shown = carousel.current?.session ?? null;
  // Plegada solo se ve la mascota de la sesión elegida; los controles van en
  // el panel desplegado. ←/→ valen en las dos con la ventana enfocada.
  useCarouselKeys(carousel.step, shown !== null);
  const sessionsCarousel = shown ? carousel : undefined;
  const identity = shown?.identity;
  // El snapshot visto desde la sesión elegida: la fatiga, la música y el foco
  // siguen siendo de la cuenta; el estado, desde cuándo y el proyecto, suyos.
  const viewed: PetSnapshot | null =
    state && shown
      ? {
          ...state.pet,
          state: shown.state,
          since: shown.since,
          commitHash: shown.commitHash,
          project: shown.name,
        }
      : (state?.pet ?? null);
  const { t } = useTranslation();
  const pointerDownAt = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  // Un panel u otro: los dos a la vez harían de la mascota un dashboard.
  const [panel, setPanel] = useState<Panel>(readPanel);
  const [lastPanel, setLastPanel] = useState<OpenPanel>(readLastPanel);
  const expanded = panel !== "none";
  const [petScale, setPetScale] = useState<PetScale>(readScale);
  const settingsScale = state?.settings.petScale;
  useEffect(() => {
    if (settingsScale === undefined) return;
    setPetScale(settingsScale);
    localStorage.setItem(SCALE_KEY, String(settingsScale));
  }, [settingsScale]);
  const collapsed = collapsedSize(petScale);
  // Con el daemon sin responder no se sabe nada de los hooks (#34, #39 ya
  // cubren ese caso); `useHealth` conserva la última respuesta, de ahí el filtro.
  const hooksMissing =
    status !== "offline" &&
    !health.unreachable &&
    (health.health?.checks.some((c) => c.name === "hooks" && !c.ok) ?? false);

  useEffect(() => {
    if (quitRequested) quitApp();
  }, [quitRequested]);

  // Sin `state` (daemon caído) el menú conserva la última entrada.
  const update = state ? pendingUpdate(state.update, state.settings) : null;
  const updateVersion = state ? (update?.version ?? null) : undefined;
  const updateUrl = update?.url ?? null;
  useEffect(() => {
    if (updateVersion === undefined) return;
    setUpdateMenu(
      updateVersion && updateUrl
        ? {
            label: t("pet.window.downloadUpdate", { version: updateVersion }),
            url: updateUrl,
          }
        : null,
    );
  }, [updateVersion, updateUrl, t]);

  useEffect(() => {
    localStorage.setItem(PANEL_KEY, panel);
    if (panel === "none") {
      resizeWindow(collapsed.width, collapsed.height);
    } else {
      setLastPanel(panel);
      localStorage.setItem(LAST_PANEL_KEY, panel);
    }
  }, [panel, collapsed.width, collapsed.height]);

  // Desplegada, el alto real depende de cuántos proveedores hay y de
  // si el countdown envuelve a dos líneas — una constante fija recorta
  // el porcentaje con el `overflow: hidden` de `.petWindow` en cuanto
  // el contenido real es más alto que la adivinanza. `ResizeObserver`
  // remide cada vez que el contenido cambia de tamaño por cualquier
  // motivo (proveedores, texto, fuentes), en vez de adivinar qué
  // dependencias de React lo disparan. Se observa el contenido y no la
  // raíz: esta mide siempre lo que la ventana nativa, así que no avisaría
  // al crecer (la lista de dispositivos) ni dejaría encoger.
  useLayoutEffect(() => {
    if (!expanded || !contentRef.current) return;
    const el = contentRef.current;

    const measure = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height > 0) resizeWindow(EXPANDED_WIDTH, height);
    };
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);

  // Solo el botón principal pliega, despliega o arrastra: el derecho es
  // para el menú contextual.
  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
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
    startDrag();
  }

  function handlePointerUp() {
    if (!pointerDownAt.current) return;
    if (!dragStarted.current) {
      setPanel((current) => (current === "none" ? lastPanel : "none"));
    }
    pointerDownAt.current = null;
    dragStarted.current = false;
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: el clic derecho es un atajo; el mismo menú está en la bandeja
    <div
      className={styles.petWindow}
      data-status={status}
      data-expanded={expanded}
      data-panel={panel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={(e) => {
        // Fuera de Tauri se deja el menú del navegador.
        if (!isTauri()) return;
        e.preventDefault();
        showPetMenu();
      }}
    >
      {hooksMissing && !expanded && (
        <span
          className={styles.hooksMark}
          role="img"
          aria-label={t("pet.window.hooksMissing")}
        >
          !
        </span>
      )}
      {!hooksMissing && update && !expanded && (
        <span
          className={`${styles.hooksMark} ${styles.updateMark}`}
          role="img"
          aria-label={t("pet.window.update")}
        >
          ↑
        </span>
      )}
      {!expanded && (
        <div
          className={styles.petArea}
          style={
            {
              "--pet-w": `${collapsed.width}px`,
              "--pet-h": `${collapsed.height}px`,
            } as React.CSSProperties
          }
        >
          {status === "offline" ? (
            <PetOffline />
          ) : state ? (
            <Pet
              state={viewed?.state ?? state.pet.state}
              level={state.pet.level}
              fatigue={state.pet.fatigue}
              resetsAt={
                state.quotas[0]?.authoritative?.fiveHour.resetsAt ?? null
              }
              commitHash={viewed?.commitHash ?? null}
              listening={state.pet.listening}
              musicPrefs={state.settings}
              othersActive={state.pet.othersActive}
              identity={identity}
              skin={skin}
            />
          ) : (
            <span>{t(`common.connection.${status}`)}</span>
          )}
        </div>
      )}
      {expanded && (
        <div ref={contentRef}>
          {hooksMissing && <HooksAlert onRepaired={health.refresh} />}
          {panel === "quota" && state && (
            <QuotaPanel
              pet={viewed ?? state.pet}
              carousel={sessionsCarousel}
              status={status}
              quotas={state.quotas}
              now={now}
              musicPrefs={state.settings}
              onSelectPanel={setPanel}
            />
          )}
          {panel === "media" && (
            <MediaPanel
              pet={viewed ?? state?.pet ?? null}
              carousel={sessionsCarousel}
              resetsAt={
                state?.quotas[0]?.authoritative?.fiveHour.resetsAt ?? null
              }
              now={now}
              media={state?.media ?? null}
              status={status}
              musicPrefs={state?.settings}
              onSelectPanel={setPanel}
            />
          )}
        </div>
      )}
    </div>
  );
}
