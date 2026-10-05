export const SKIN_EASINGS = [
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
] as const;
export type SkinEasing = (typeof SKIN_EASINGS)[number];

export interface SkinKeyframe {
  /** Porcentaje de la animación, 0–100. */
  at: number;
  x?: number;
  y?: number;
  rotate?: number;
  /** Un número escala por igual; un par, `[x, y]`. */
  scale?: number | [number, number];
  opacity?: number;
}

export interface SkinAnimation {
  /** Duración en múltiplos de `--t`, el tempo que la fatiga ralentiza. */
  beats: number;
  keyframes: SkinKeyframe[];
  easing?: SkinEasing;
  /** Salto discreto en N pasos; excluye `easing`. */
  steps?: number;
  /** Retardo en beats, para encadenar piezas. */
  delay?: number;
}

export const SKIN_ANIMATION_LIMITS = {
  beats: { min: 0, max: 32 },
  delay: { min: 0 },
  at: { min: 0, max: 100 },
  offset: { min: -150, max: 150 },
  rotate: { min: -720, max: 720 },
  scale: { min: 0, max: 4 },
  opacity: { min: 0, max: 1 },
  steps: { min: 1, max: 64 },
  keyframes: { min: 1, max: 32 },
} as const;

const NAME_RE = /^[a-z][a-z0-9-]{0,31}$/;
const ANIMATION_KEYS = ["beats", "keyframes", "easing", "steps", "delay"];
const KEYFRAME_KEYS = ["at", "x", "y", "rotate", "scale", "opacity"];

export const isSkinAnimationName = (name: unknown): name is string =>
  typeof name === "string" && NAME_RE.test(name);

export type SkinAnimationResult =
  | { animation: SkinAnimation }
  | { errors: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function checkNumber(
  value: unknown,
  path: string,
  min: number,
  max: number,
  errors: string[],
  exclusiveMin = false,
): value is number {
  const ok =
    typeof value === "number" &&
    Number.isFinite(value) &&
    (exclusiveMin ? value > min : value >= min) &&
    value <= max;
  if (!ok) {
    const lower = exclusiveMin ? `más de ${min}` : `al menos ${min}`;
    errors.push(
      `${path}: debe ser un número finito, ${lower} y como mucho ${max}`,
    );
  }
  return ok;
}

function checkKeyframe(raw: unknown, path: string, errors: string[]) {
  if (!isRecord(raw)) {
    errors.push(`${path}: debe ser un objeto`);
    return;
  }
  const L = SKIN_ANIMATION_LIMITS;
  for (const key of Object.keys(raw)) {
    if (!KEYFRAME_KEYS.includes(key)) {
      errors.push(`${path}.${key}: campo desconocido`);
    }
  }
  checkNumber(raw.at, `${path}.at`, L.at.min, L.at.max, errors);
  for (const key of ["x", "y"] as const) {
    if (raw[key] !== undefined) {
      checkNumber(
        raw[key],
        `${path}.${key}`,
        L.offset.min,
        L.offset.max,
        errors,
      );
    }
  }
  if (raw.rotate !== undefined) {
    checkNumber(
      raw.rotate,
      `${path}.rotate`,
      L.rotate.min,
      L.rotate.max,
      errors,
    );
  }
  if (raw.opacity !== undefined) {
    checkNumber(
      raw.opacity,
      `${path}.opacity`,
      L.opacity.min,
      L.opacity.max,
      errors,
    );
  }
  if (raw.scale !== undefined) {
    if (Array.isArray(raw.scale)) {
      if (raw.scale.length !== 2) {
        errors.push(`${path}.scale: un par debe tener exactamente 2 números`);
      } else {
        raw.scale.forEach((v, i) => {
          checkNumber(
            v,
            `${path}.scale[${i}]`,
            L.scale.min,
            L.scale.max,
            errors,
          );
        });
      }
    } else {
      checkNumber(raw.scale, `${path}.scale`, L.scale.min, L.scale.max, errors);
    }
  }
}

/** Valida una animación llegada de fuera. El resultado es seguro para `animationCss`. */
export function validateSkinAnimation(raw: unknown): SkinAnimationResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { errors: ["la animación debe ser un objeto"] };
  const L = SKIN_ANIMATION_LIMITS;

  for (const key of Object.keys(raw)) {
    if (!ANIMATION_KEYS.includes(key)) errors.push(`${key}: campo desconocido`);
  }

  checkNumber(raw.beats, "beats", L.beats.min, L.beats.max, errors, true);

  if (raw.delay !== undefined) {
    const beats = typeof raw.beats === "number" ? raw.beats : L.beats.max;
    if (checkNumber(raw.delay, "delay", L.delay.min, L.beats.max, errors)) {
      if (raw.delay >= beats) errors.push("delay: debe ser menor que beats");
    }
  }

  if (raw.easing !== undefined) {
    if (!SKIN_EASINGS.includes(raw.easing as never)) {
      errors.push(`easing: debe ser una de ${SKIN_EASINGS.join(", ")}`);
    }
  }

  if (raw.steps !== undefined) {
    if (checkNumber(raw.steps, "steps", L.steps.min, L.steps.max, errors)) {
      if (!Number.isInteger(raw.steps))
        errors.push("steps: debe ser un entero");
    }
    if (raw.easing !== undefined) {
      errors.push("steps: no se puede combinar con easing");
    }
  }

  if (!Array.isArray(raw.keyframes)) {
    errors.push("keyframes: debe ser una lista");
  } else {
    const n = raw.keyframes.length;
    if (n < L.keyframes.min || n > L.keyframes.max) {
      errors.push(
        `keyframes: debe tener entre ${L.keyframes.min} y ${L.keyframes.max} fotogramas`,
      );
    }
    let prev = -1;
    raw.keyframes.forEach((kf, i) => {
      checkKeyframe(kf, `keyframes[${i}]`, errors);
      const at = isRecord(kf) ? kf.at : undefined;
      if (typeof at === "number" && Number.isFinite(at)) {
        if (at <= prev) {
          errors.push(
            `keyframes[${i}].at: debe ser mayor que el del fotograma anterior`,
          );
        }
        prev = at;
      }
    });
  }

  if (errors.length > 0) return { errors };
  return { animation: raw as unknown as SkinAnimation };
}
