import { IDENTITY_COLORS, type SessionPet } from "@amnis/shared";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { stateTitle } from "../Pet/Pet.tsx";
import {
  type CarouselPick,
  type Resolved,
  resolvePick,
  stepPick,
} from "./carousel.ts";
import styles from "./SessionCarousel.module.css";

export interface SessionCarouselState {
  sessions: SessionPet[];
  /** La sesión que se ve; `null` sin sesiones vivas. */
  current: Resolved | null;
  step: (dir: 1 | -1) => void;
  select: (sessionId: string) => void;
}

/**
 * Posición en el carrusel: estado de este cliente, no un ajuste (épica E14),
 * como el scroll de una página. Se guarda el `sessionId` y, tras cada cambio de
 * la lista, se vuelve a fijar lo resuelto: si la sesión vista sale, la que la
 * sustituye queda elegida por id y la siguiente salida ya no la mueve.
 */
export function useSessionCarousel(
  sessions: SessionPet[],
): SessionCarouselState {
  const [pick, setPick] = useState<CarouselPick>(null);
  const current = resolvePick(sessions, pick);
  if (
    current &&
    (pick?.sessionId !== current.session.sessionId ||
      pick.index !== current.index)
  ) {
    setPick({ sessionId: current.session.sessionId, index: current.index });
  }
  return {
    sessions,
    current,
    step: (dir) => setPick(stepPick(sessions, current, dir)),
    select: (sessionId) => {
      const index = sessions.findIndex((s) => s.sessionId === sessionId);
      if (index !== -1) setPick({ sessionId, index });
    },
  };
}

/** ←/→ sin modificadores y fuera de un campo de texto: si no, no son nuestras. */
function arrowDir(e: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}): 1 | -1 | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const el = e.target instanceof HTMLElement ? e.target : null;
  if (
    el &&
    (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
  ) {
    return null;
  }
  if (e.key === "ArrowRight") return 1;
  if (e.key === "ArrowLeft") return -1;
  return null;
}

export interface SessionCarouselProps {
  carousel: SessionCarouselState;
  /** `pet`: la franja se come la parte baja del área fija de la ventana
   * flotante, sin ensancharla ni tapar a la mascota. `hero`: va bajo el escenario. */
  layout: "pet" | "hero";
  /** `window`: ←/→ en toda la ventana (la flotante, que solo los recibe
   * enfocada: nada de atajos globales). `local`: solo con el foco dentro del
   * carrusel, para no robárselos al resto del dashboard. */
  keys: "window" | "local";
  /** El escenario con la `<Pet>` de `carousel.current`. */
  children: ReactNode;
}

/**
 * Flechas, contador, worktree y un punto por sesión con su color de identidad.
 * El punto de una sesión en `waiting` se marca: así se ve que pide permiso sin
 * pasar por todas, y pulsarlo lleva directo a ella.
 */
export function SessionCarousel({
  carousel,
  layout,
  keys,
  children,
}: SessionCarouselProps) {
  const { t } = useTranslation();
  const { sessions, current, step, select } = carousel;
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (keys !== "window") return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const dir = arrowDir(e);
      if (dir === null) return;
      e.preventDefault();
      stepRef.current(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys]);

  function onKeyDown(e: KeyboardEvent<HTMLFieldSetElement>) {
    if (keys !== "local") return;
    const dir = arrowDir(e);
    if (dir === null) return;
    e.preventDefault();
    step(dir);
  }

  const many = sessions.length > 1;
  const name = current?.session.name ?? "";

  return (
    <fieldset
      className={styles.root}
      data-layout={layout}
      aria-label={t("pet.carousel.label")}
      onKeyDown={onKeyDown}
    >
      <div className={styles.stage}>{children}</div>
      {/* Corta el pointerdown: pulsar un control no pliega ni arrastra la ventana. */}
      <div
        className={styles.strip}
        data-testid="carousel-strip"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {many && (
          <button
            type="button"
            className={styles.arrow}
            aria-label={t("pet.carousel.prev")}
            onClick={() => step(-1)}
          >
            ‹
          </button>
        )}
        {many && (
          <span className={styles.dots}>
            {sessions.map((s) => (
              <button
                key={s.sessionId}
                type="button"
                className={styles.dot}
                style={{
                  background: `var(--id-${s.identity % IDENTITY_COLORS})`,
                }}
                aria-label={t("pet.carousel.dot", {
                  name: s.name,
                  state: stateTitle(s.state),
                })}
                aria-current={
                  s.sessionId === current?.session.sessionId
                    ? "true"
                    : undefined
                }
                data-waiting={s.state === "waiting" || undefined}
                data-testid="carousel-dot"
                onClick={() => select(s.sessionId)}
              />
            ))}
          </span>
        )}
        <span className={styles.label} title={current?.session.worktree}>
          {many && (
            <span className={styles.position}>
              {t("pet.carousel.position", {
                index: (current?.index ?? 0) + 1,
                total: sessions.length,
              })}
            </span>
          )}
          <span className={styles.name}>{name}</span>
        </span>
        {many && (
          <button
            type="button"
            className={styles.arrow}
            aria-label={t("pet.carousel.next")}
            onClick={() => step(1)}
          >
            ›
          </button>
        )}
      </div>
    </fieldset>
  );
}
