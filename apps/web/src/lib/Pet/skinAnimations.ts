import {
  isSkinAnimationName,
  type SkinAnimation,
  type SkinKeyframe,
  validateSkinAnimation,
} from "@amnis/shared";
import type { CSSProperties } from "react";

const PREFIX = "amnis-anim-";

/** Nombre de la clase que aplica la animación; el `@keyframes` lleva el mismo. */
export const animationClass = (name: string): string => PREFIX + name;

/** Todo número que llega al CSS pasa por aquí: nunca un texto. */
function num(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`valor no numérico en una animación: ${typeof v}`);
  }
  return String(Math.round(v * 1000) / 1000);
}

const TRANSFORM_KEYS = ["x", "y", "rotate", "scale"] as const;

function transformOf(kf: SkinKeyframe): string {
  const [sx, sy] = Array.isArray(kf.scale)
    ? kf.scale
    : [kf.scale ?? 1, kf.scale ?? 1];
  return `translate(${num(kf.x ?? 0)}px,${num(kf.y ?? 0)}px) rotate(${num(kf.rotate ?? 0)}deg) scale(${num(sx)},${num(sy)})`;
}

/**
 * CSS de una animación: `@keyframes`, la clase que la aplica y su apagado con
 * movimiento reducido. Revalida entrada y nombre y lanza si no cuadran: el
 * generador no se fía de quien lo llama.
 */
export function animationCss(name: string, anim: SkinAnimation): string {
  if (!isSkinAnimationName(name)) {
    throw new Error(`nombre de animación inválido: ${JSON.stringify(name)}`);
  }
  const checked = validateSkinAnimation(anim);
  if ("errors" in checked) {
    throw new Error(
      `animación "${name}" inválida: ${checked.errors.join("; ")}`,
    );
  }
  const { beats, keyframes, easing, steps, delay } = checked.animation;
  const usesTransform = keyframes.some((kf) =>
    TRANSFORM_KEYS.some((k) => kf[k] !== undefined),
  );

  const frames = keyframes
    .map((kf) => {
      const decls: string[] = [];
      if (usesTransform) decls.push(`transform:${transformOf(kf)}`);
      if (kf.opacity !== undefined) decls.push(`opacity:${num(kf.opacity)}`);
      return `${num(kf.at)}%{${decls.join(";")}}`;
    })
    .join("");

  const timing =
    steps !== undefined
      ? `steps(${num(steps)},end)`
      : (easing ?? "ease-in-out");
  const wait = delay ? ` calc(var(--t)*${num(delay)})` : "";
  const id = PREFIX + name;
  return [
    `@keyframes ${id}{${frames}}`,
    `.${id}{animation:${id} calc(var(--t)*${num(beats)}) ${timing}${wait} infinite}`,
    `@media (prefers-reduced-motion:reduce){.${id}{animation:none}}`,
  ].join("\n");
}

/** Pivote en coordenadas del viewBox 150×110, como los `transformOrigin` de BIT. */
export function pivotStyle(pivot: readonly [number, number]): CSSProperties {
  return {
    transformOrigin: `${num(pivot[0])}px ${num(pivot[1])}px`,
    transformBox: "view-box",
  };
}

/**
 * Catálogo de serie, en el mismo formato que una skin usaría en su manifest.
 * Solo entra lo que funciona con cualquier pivote; las escenas a medida de BIT
 * se quedan en `Pet.module.css`.
 */
export const SERIES_ANIMATIONS: Record<string, SkinAnimation> = {
  // Cuerpo
  bob: {
    beats: 1,
    keyframes: [
      { at: 0, y: 0 },
      { at: 50, y: -2.5 },
      { at: 100, y: 0 },
    ],
  },
  hop: {
    beats: 1.6,
    keyframes: [
      { at: 0, y: 0 },
      { at: 22, y: -4 },
      { at: 44, y: 0 },
      { at: 66, y: -2 },
      { at: 100, y: 0 },
    ],
  },
  breathe: {
    beats: 3.4,
    keyframes: [
      { at: 0, scale: 1 },
      { at: 50, scale: [1.02, 1.035] },
      { at: 100, scale: 1 },
    ],
  },
  blink: {
    beats: 4.5,
    keyframes: [
      { at: 0, scale: 1 },
      { at: 88, scale: 1 },
      { at: 93, scale: [1, 0.06] },
      { at: 100, scale: 1 },
    ],
  },
  tap: {
    beats: 0.5,
    keyframes: [
      { at: 0, rotate: 0 },
      { at: 50, rotate: 8 },
      { at: 100, rotate: 0 },
    ],
  },
  nod: {
    beats: 2.2,
    keyframes: [
      { at: 0, rotate: -5 },
      { at: 50, rotate: 2 },
      { at: 100, rotate: -5 },
    ],
  },
  swing: {
    beats: 2.6,
    keyframes: [
      { at: 0, rotate: -8 },
      { at: 50, rotate: 8 },
      { at: 100, rotate: -8 },
    ],
  },
  shake: {
    beats: 0.8,
    keyframes: [
      { at: 0, rotate: 0 },
      { at: 25, rotate: -5 },
      { at: 75, rotate: 5 },
      { at: 100, rotate: 0 },
    ],
  },
  knock: {
    beats: 2.4,
    keyframes: [
      { at: 0, rotate: 0 },
      { at: 55, rotate: 0 },
      { at: 66, rotate: -13 },
      { at: 76, rotate: -2 },
      { at: 88, rotate: -11 },
      { at: 100, rotate: 0 },
    ],
  },
  sip: {
    beats: 4.4,
    keyframes: [
      { at: 0, rotate: 0 },
      { at: 44, rotate: -16 },
      { at: 56, rotate: -16 },
      { at: 100, rotate: 0 },
    ],
  },
  spin: {
    beats: 2,
    easing: "linear",
    keyframes: [
      { at: 0, rotate: 0 },
      { at: 100, rotate: 360 },
    ],
  },

  // Objetos
  scroll: {
    beats: 2.4,
    steps: 4,
    keyframes: [
      { at: 0, y: 0 },
      { at: 100, y: -24 },
    ],
  },
  cursor: {
    beats: 1,
    steps: 1,
    keyframes: [
      { at: 0, opacity: 1 },
      { at: 50, opacity: 0 },
      { at: 100, opacity: 0 },
    ],
  },
  pulse: {
    beats: 0.5,
    keyframes: [
      { at: 0, opacity: 0.12 },
      { at: 50, opacity: 1 },
      { at: 100, opacity: 0.12 },
    ],
  },
  "pulse-2": {
    beats: 0.5,
    delay: 0.12,
    keyframes: [
      { at: 0, opacity: 0.12 },
      { at: 50, opacity: 1 },
      { at: 100, opacity: 0.12 },
    ],
  },
  "pulse-3": {
    beats: 0.5,
    delay: 0.25,
    keyframes: [
      { at: 0, opacity: 0.12 },
      { at: 50, opacity: 1 },
      { at: 100, opacity: 0.12 },
    ],
  },
  "pulse-4": {
    beats: 0.5,
    delay: 0.37,
    keyframes: [
      { at: 0, opacity: 0.12 },
      { at: 50, opacity: 1 },
      { at: 100, opacity: 0.12 },
    ],
  },
  glow: {
    beats: 2,
    keyframes: [
      { at: 0, opacity: 0.35 },
      { at: 50, opacity: 1 },
      { at: 100, opacity: 0.35 },
    ],
  },
  wander: {
    beats: 4.4,
    keyframes: [
      { at: 0, x: -13, y: -7 },
      { at: 42, x: 13, y: -7 },
      { at: 50, x: -13, y: 5 },
      { at: 92, x: 13, y: 5 },
      { at: 100, x: -13, y: -7 },
    ],
  },
  drift: {
    beats: 2.6,
    keyframes: [
      { at: 0, x: 0, y: 1 },
      { at: 50, x: 2, y: -3 },
      { at: 100, x: 0, y: 1 },
    ],
  },
  pop: {
    beats: 3.4,
    easing: "ease-out",
    keyframes: [
      { at: 0, scale: 0, opacity: 0 },
      { at: 12, scale: 0, opacity: 0 },
      { at: 26, scale: 1.25, opacity: 1 },
      { at: 34, scale: 1, opacity: 1 },
      { at: 100, scale: 1, opacity: 1 },
    ],
  },
  steam: {
    beats: 3,
    easing: "ease-out",
    keyframes: [
      { at: 0, y: 5, scale: [0.75, 1], opacity: 0 },
      { at: 28, y: -1, scale: [0.92, 1], opacity: 0.85 },
      { at: 100, y: -16, scale: [1.35, 1], opacity: 0 },
    ],
  },
  zzz: {
    beats: 3,
    easing: "ease-out",
    keyframes: [
      { at: 0, x: 0, y: 0, scale: 0.7, opacity: 0 },
      { at: 25, x: 2, y: -4, scale: 0.81, opacity: 1 },
      { at: 100, x: 8, y: -16, scale: 1.15, opacity: 0 },
    ],
  },
};

/** CSS de todo el catálogo; se inyecta una vez por página. */
export function catalogCss(): string {
  return Object.entries(SERIES_ANIMATIONS)
    .map(([name, anim]) => animationCss(name, anim))
    .join("\n");
}
