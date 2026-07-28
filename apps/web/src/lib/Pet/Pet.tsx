import type { PetSnapshot } from "@amnis/shared";
import type { CSSProperties } from "react";
import styles from "./Pet.module.css";

export interface PetProps {
  state: PetSnapshot["state"];
  level: number;
  fatigue: number;
}

type EyeShape = "open" | "half" | "side" | "up" | "wide" | "happy" | "line";
type AccessoryKind =
  | "cursor"
  | "check"
  | "magnifier"
  | "dots"
  | "question"
  | "zzz"
  | "none";

interface StateLook {
  eyes: EyeShape;
  accessory: AccessoryKind;
  /** Español, para `<title>` — describe el estado, no lo repite literal. */
  title: string;
}

/**
 * Un estado nuevo en `PetState` sin entrada aquí no compila: es la
 * garantía de que la mascota nunca se queda muda ante un estado real
 * (docs/DESIGN.md §4 — la máquina de estados no sabe de gráficos, pero
 * este mapa es la única pieza que sí sabe traducirlos).
 */
const STATE_LOOK: Record<PetSnapshot["state"], StateLook> = {
  coding: { eyes: "open", accessory: "cursor", title: "Escribiendo código" },
  testing: { eyes: "half", accessory: "check", title: "Corriendo tests" },
  researching: {
    eyes: "side",
    accessory: "magnifier",
    title: "Buscando información",
  },
  planning: { eyes: "up", accessory: "dots", title: "Planificando" },
  waiting: { eyes: "wide", accessory: "question", title: "Esperando permiso" },
  resting: { eyes: "happy", accessory: "none", title: "Descansando" },
  sleeping: { eyes: "line", accessory: "zzz", title: "Durmiendo" },
};

/**
 * docs/DESIGN.md §4: "fresca al 10%, agotada al 85%, revive en el
 * reset". El tramo por debajo de 0.10 y por encima de 0.85 satura en
 * vez de extrapolar, para que el 0-10% siga leyéndose como "fresca".
 */
export function fatigueLevel(fatigue: number): number {
  const t = (fatigue - 0.1) / (0.85 - 0.1);
  return Math.min(1, Math.max(0, t));
}

function Eyes({ shape }: { shape: EyeShape }) {
  switch (shape) {
    case "open":
      return (
        <>
          <circle className={styles.eye} cx="38" cy="48" r="5" />
          <circle className={styles.eye} cx="62" cy="48" r="5" />
        </>
      );
    case "wide":
      return (
        <>
          <circle className={styles.eye} cx="38" cy="48" r="7" />
          <circle className={styles.eye} cx="62" cy="48" r="7" />
        </>
      );
    case "half":
      return (
        <>
          <rect
            className={styles.eye}
            x="33"
            y="46"
            width="10"
            height="4"
            rx="2"
          />
          <rect
            className={styles.eye}
            x="57"
            y="46"
            width="10"
            height="4"
            rx="2"
          />
        </>
      );
    case "up":
      return (
        <>
          <circle className={styles.eye} cx="38" cy="48" r="5" />
          <circle className={styles.eye} cx="62" cy="48" r="5" />
          <circle className={styles.pupil} cx="38" cy="45" r="2" />
          <circle className={styles.pupil} cx="62" cy="45" r="2" />
        </>
      );
    case "side":
      return (
        <>
          <circle className={styles.eye} cx="38" cy="48" r="5" />
          <circle className={styles.eye} cx="62" cy="48" r="5" />
          <circle className={styles.pupil} cx="40" cy="48" r="2" />
          <circle className={styles.pupil} cx="64" cy="48" r="2" />
        </>
      );
    case "happy":
      return (
        <>
          <path className={styles.eyeArc} d="M33 49 Q38 44 43 49" />
          <path className={styles.eyeArc} d="M57 49 Q62 44 67 49" />
        </>
      );
    case "line":
      return (
        <>
          <line className={styles.eyeLine} x1="33" y1="48" x2="43" y2="48" />
          <line className={styles.eyeLine} x1="57" y1="48" x2="67" y2="48" />
        </>
      );
  }
}

function Accessory({ kind }: { kind: AccessoryKind }) {
  switch (kind) {
    case "cursor":
      return (
        <rect className={styles.cursor} x="48" y="68" width="4" height="10" />
      );
    case "check":
      return <path className={styles.check} d="M40 66 L47 73 L61 58" />;
    case "magnifier":
      return (
        <g className={styles.magnifier}>
          <circle cx="78" cy="42" r="7" />
          <line x1="83" y1="47" x2="90" y2="54" />
        </g>
      );
    case "dots":
      return (
        <g className={styles.dots}>
          <circle className={styles.dot} cx="42" cy="16" r="2.5" />
          <circle className={styles.dot} cx="50" cy="16" r="2.5" />
          <circle className={styles.dot} cx="58" cy="16" r="2.5" />
        </g>
      );
    case "question":
      return (
        <text className={styles.question} x="50" y="20" textAnchor="middle">
          ?
        </text>
      );
    case "zzz":
      return (
        <text className={styles.zzz} x="70" y="22" textAnchor="middle">
          z
        </text>
      );
    case "none":
      return null;
  }
}

/**
 * `<Pet>` recibe `{state, level, fatigue}` y no sabe nada de sprites
 * (docs/DESIGN.md §4). SVG/CSS procedural, sin assets externos.
 * `viewBox` + `100%` — nunca `width`/`height` fijos — es lo que permite
 * al mismo componente servir de icono de 160 px y de viewport completo
 * (docs/STACK.md §2), y no lleva fondo, marco ni tamaño propio: eso
 * vive en las envolturas de routes/.
 */
export function Pet({ state, level, fatigue }: PetProps) {
  const look = STATE_LOOK[state];
  const style = {
    "--pet-fatigue": fatigueLevel(fatigue),
  } as CSSProperties;

  return (
    <svg
      className={styles.pet}
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      role="img"
      data-testid="pet"
      data-state={state}
      data-level={level}
      style={style}
    >
      <title>{look.title}</title>
      <ellipse className={styles.body} cx="50" cy="58" rx="34" ry="30" />
      <g className={styles.eyes}>
        <Eyes shape={look.eyes} />
      </g>
      <g className={styles.accessory} data-look={look.accessory}>
        <Accessory kind={look.accessory} />
      </g>
    </svg>
  );
}
