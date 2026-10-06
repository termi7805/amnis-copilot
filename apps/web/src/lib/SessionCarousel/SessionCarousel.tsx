import { IDENTITY_COLORS, type SessionPet } from "@amnis/shared";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
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

/**
 * ←/→ en toda la ventana mientras `enabled`: es la ventana flotante, que solo
 * los recibe enfocada (nada de atajos globales). Va aparte de los controles
 * porque plegada la mascota no los pinta y las teclas siguen valiendo.
 */
export function useCarouselKeys(step: (dir: 1 | -1) => void, enabled: boolean) {
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const dir = arrowDir(e);
      if (dir === null) return;
      e.preventDefault();
      stepRef.current(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

export interface SessionCarouselProps {
  carousel: SessionCarouselState;
  /** `panel`: con la estética del panel desplegado de la mascota (bordes de
   * 2 px, mayúsculas mono). `hero`: la del dashboard, bajo el escenario. */
  layout: "panel" | "hero";
  /** Con `true`, ←/→ con el foco dentro de los controles (dashboard: no se
   * los roba al resto de la página). La mascota usa `useCarouselKeys`. */
  localKeys?: boolean;
}

/**
 * Flechas, contador, worktree y un punto por sesión con su color de identidad.
 * El punto de una sesión en `waiting` se marca: así se ve que pide permiso sin
 * pasar por todas, y pulsarlo lleva directo a ella. Solo los controles: la
 * mascota de `carousel.current` la pinta quien lo usa.
 */
export function SessionCarousel({
  carousel,
  layout,
  localKeys = false,
}: SessionCarouselProps) {
  const { t } = useTranslation();
  const { sessions, current, step, select } = carousel;

  function onKeyDown(e: KeyboardEvent<HTMLFieldSetElement>) {
    if (!localKeys) return;
    const dir = arrowDir(e);
    if (dir === null) return;
    e.preventDefault();
    step(dir);
  }

  const many = sessions.length > 1;
  const name = current?.session.name ?? "";

  return (
    // Corta el puntero: en la mascota, pulsar un control no pliega ni arrastra la ventana.
    <fieldset
      className={styles.root}
      data-layout={layout}
      data-testid="carousel"
      aria-label={t("pet.carousel.label")}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
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
                s.sessionId === current?.session.sessionId ? "true" : undefined
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
    </fieldset>
  );
}
