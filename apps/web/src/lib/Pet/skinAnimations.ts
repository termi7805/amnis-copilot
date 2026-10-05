import {
  isSkinAnimationName,
  SERIES_ANIMATIONS,
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

/** CSS de todo el catálogo; se inyecta una vez por página. */
export function catalogCss(): string {
  return Object.entries(SERIES_ANIMATIONS)
    .map(([name, anim]) => animationCss(name, anim))
    .join("\n");
}
