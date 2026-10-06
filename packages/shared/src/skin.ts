import { SERIES_ANIMATIONS } from "./seriesAnimations.ts";
import {
  isSkinAnimationName,
  SKIN_ANIMATION_LIMITS,
  type SkinAnimation,
  validateSkinAnimation,
} from "./skinAnimation.ts";
import type { PetState } from "./types.ts";

/** Proporción fija de la escena: la skin pinta dentro del mismo viewBox que BIT. */
export const SKIN_SCENE = { width: 150, height: 110 } as const;

/** Datos de Amnis que una capa de texto puede mostrar; lista cerrada. */
export const SKIN_TEXT_DATA = ["commitHash", "resetsCountdown"] as const;
export type SkinTextDatum = (typeof SKIN_TEXT_DATA)[number];

export const SKIN_LIMITS = {
  /** Lado máximo del lienzo declarado en `size`. */
  size: 4096,
  layers: { min: 1, max: 32 },
  frames: { min: 2, max: 64 },
  animations: 64,
  name: 40,
} as const;

/** Los estados que una skin puede pintar. */
export const SKIN_STATES: readonly PetState[] = [
  "coding",
  "testing",
  "researching",
  "planning",
  "waiting",
  "resting",
  "sleeping",
  "terminal",
  "subagents",
  "committing",
  "pushing",
  "limited",
];

export const SKIN_IMAGE_EXTENSIONS = [
  "png",
  "webp",
  "jpg",
  "jpeg",
  "gif",
  "svg",
];
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

interface SkinLayerBase {
  /** Animación del catálogo de serie o de `animations` del manifest. */
  anim?: string;
  /** Pivote de la animación, en coordenadas del lienzo. */
  pivot?: [number, number];
}

export type SkinLayerRole = "head" | "player";

export interface SkinImageLayer extends SkinLayerBase {
  /** Ruta relativa a la carpeta de la skin, siempre con `/`. */
  src: string;
  /** `[x, y, ancho, alto]`: solo se ve esa zona de la imagen. */
  clip?: [number, number, number, number];
  /** Tira horizontal de N fotogramas, reproducida con `steps()`. */
  frames?: number;
  /** Duración de la tira entera, en beats; solo con `frames`. */
  beats?: number;
  /**
   * `head`: la capa que cabecea con la música y lleva los cascos (y la pantalla
   * «sonando», salvo que el estado tenga capa `player`). `player`: la capa que
   * lleva la pantalla «sonando» en vez de la cabeza (un portátil, un cartel).
   */
  role?: SkinLayerRole;
  /** Con `role`: dónde cae, en la escena, el centro de la pantalla de BIT, que es donde se centran cascos y pantalla «sonando». */
  anchor?: [number, number];
  /** Con `role`: tamaño de cascos y pantalla respecto a la cabeza de BIT (1 = igual). */
  scale?: number;
  /** Solo con `role: "head"`: `false` = cabecea sin cascos. Por defecto los lleva. */
  headphones?: false;
  /** Solo con `role: "head"`: `false` = sin pantalla «sonando» en la cabeza. Por defecto la lleva si el estado no tiene capa `player`. */
  player?: false;
  /**
   * `true`: la capa lleva el color de identidad de la sesión (foco «Todas»): su
   * silueta (el alfa) se rellena con ese color y no se pinta sin identidad. Una
   * skin sin capas `identity` no muestra color de sesión.
   */
  identity?: true;
}

export const SKIN_HEAD_SCALE_MAX = 4;

export interface SkinTextLayer extends SkinLayerBase {
  text: SkinTextDatum;
  at: [number, number];
  size: number;
  /** Solo hex: nunca una cadena libre de CSS. */
  color: string;
}

export type SkinLayer = SkinImageLayer | SkinTextLayer;

export interface SkinManifest {
  name?: string;
  /** Lienzo de la skin; misma proporción que la escena. */
  size: [number, number];
  animations: Record<string, SkinAnimation>;
  states: Partial<Record<PetState, { layers: SkinLayer[] }>>;
}

export type SkinManifestResult =
  | { manifest: SkinManifest; warnings: string[] }
  | { errors: string[] };

const SKIN_ID_RE = /^[A-Za-z0-9._-]+$/;

/** El `id` de una skin es el nombre de su carpeta en `~/.amnis/skins/`. */
export const isSkinId = (id: unknown): id is string =>
  typeof id === "string" && SKIN_ID_RE.test(id) && id !== "." && id !== "..";

/** Una skin instalada tal como la lista el daemon. */
export interface SkinSummary {
  /** Nombre de la carpeta en `~/.amnis/skins/`. */
  id: string;
  /** `name` del manifest, si la skin carga y lo declara. */
  name: string | null;
  /** Estados que la skin pinta; vacío si no carga. */
  states: PetState[];
  /** Vacío si la skin carga. */
  errors: string[];
  warnings: string[];
}

/**
 * Las skins instaladas y su revisión: `rev` sube con cada relectura de la
 * carpeta, también si la lista queda igual, para que la web vuelva a pedir las
 * imágenes que se hayan retocado.
 */
export interface SkinsSnapshot {
  rev: number;
  skins: SkinSummary[];
}

export const isSkinTextLayer = (layer: SkinLayer): layer is SkinTextLayer =>
  "text" in layer;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** Cadena de ruta de un manifest sin tocar el disco; `null` si es válida. */
export function skinPathProblem(src: string): string | null {
  if (src.length === 0 || src.length > 200)
    return "debe tener 1–200 caracteres";
  if (src.includes("\\")) return "usa `/` como separador, no `\\`";
  if (src.startsWith("/") || /^[A-Za-z]:/.test(src) || src.includes(":")) {
    return "debe ser relativa a la carpeta de la skin, no absoluta ni una URL";
  }
  const segments = src.split("/");
  if (segments.some((s) => s === "..")) {
    return "no puede salir de la carpeta de la skin (`..`)";
  }
  if (segments.some((s) => s === "." || s === "")) {
    return "no puede llevar segmentos vacíos ni `.`";
  }
  if (!segments.every((s) => SEGMENT_RE.test(s))) {
    return "solo admite letras, números, `.`, `_` y `-` en cada segmento";
  }
  const ext = src.split(".").pop()?.toLowerCase() ?? "";
  if (!src.includes(".") || !SKIN_IMAGE_EXTENSIONS.includes(ext)) {
    return `debe ser una imagen (${SKIN_IMAGE_EXTENSIONS.join(", ")})`;
  }
  return null;
}

class Report {
  errors: string[] = [];
  warnings: string[] = [];
  error(path: string, why: string) {
    this.errors.push(`${path}: ${why}`);
  }
  warn(path: string, why: string) {
    this.warnings.push(`${path}: ${why}`);
  }
}

function pair(
  raw: unknown,
  path: string,
  r: Report,
  inside: readonly [number, number],
): [number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 2 || !raw.every(isFiniteNumber)) {
    r.error(path, "debe ser un par de números `[x, y]`");
    return null;
  }
  const [x, y] = raw as [number, number];
  if (x < 0 || y < 0 || x > inside[0] || y > inside[1]) {
    r.error(
      path,
      `queda fuera de la escena (0–${inside[0]} × 0–${inside[1]}): [${x}, ${y}]`,
    );
    return null;
  }
  return [x, y];
}

function warnUnknown(
  raw: Record<string, unknown>,
  known: readonly string[],
  path: string,
  r: Report,
) {
  for (const key of Object.keys(raw)) {
    if (!known.includes(key)) {
      r.warn(
        path ? `${path}.${key}` : key,
        "campo desconocido, se ignora (¿de una versión más nueva de Amnis?)",
      );
    }
  }
}

const IMAGE_KEYS = [
  "src",
  "anim",
  "pivot",
  "clip",
  "frames",
  "beats",
  "role",
  "anchor",
  "scale",
  "headphones",
  "player",
  "identity",
];
const TEXT_KEYS = ["text", "anim", "pivot", "at", "size", "color"];

function checkLayer(
  raw: unknown,
  path: string,
  scene: readonly [number, number],
  animations: ReadonlySet<string>,
  r: Report,
): SkinLayer | null {
  if (!isRecord(raw)) {
    r.error(path, "debe ser un objeto");
    return null;
  }
  const hasSrc = raw.src !== undefined;
  const hasText = raw.text !== undefined;
  if (hasSrc === hasText) {
    r.error(
      path,
      hasSrc
        ? "lleva `src` y `text` a la vez: una capa es una imagen o un texto"
        : "falta `src` (imagen) o `text` (dato de Amnis)",
    );
    return null;
  }

  const before = r.errors.length;
  let anim: string | undefined;
  if (raw.anim !== undefined) {
    if (typeof raw.anim !== "string" || !animations.has(raw.anim)) {
      r.error(
        `${path}.anim`,
        `${JSON.stringify(raw.anim)} no existe: ni en el catálogo de serie ni en \`animations\` de la skin`,
      );
    } else {
      anim = raw.anim;
    }
  }
  let pivot: [number, number] | undefined;
  if (raw.pivot !== undefined) {
    pivot = pair(raw.pivot, `${path}.pivot`, r, scene) ?? undefined;
  }
  const base: SkinLayerBase = {
    ...(anim !== undefined && { anim }),
    ...(pivot !== undefined && { pivot }),
  };

  if (hasText) {
    warnUnknown(raw, TEXT_KEYS, path, r);
    if (!SKIN_TEXT_DATA.includes(raw.text as SkinTextDatum)) {
      r.warn(
        `${path}.text`,
        `dato ${JSON.stringify(raw.text)} desconocido, la capa se ignora (admitidos: ${SKIN_TEXT_DATA.join(", ")})`,
      );
      return null;
    }
    const at = pair(raw.at, `${path}.at`, r, scene);
    if (!isFiniteNumber(raw.size) || raw.size <= 0 || raw.size > scene[1]) {
      r.error(
        `${path}.size`,
        `debe ser un número mayor que 0 y como mucho ${scene[1]}`,
      );
    }
    if (typeof raw.color !== "string" || !HEX_COLOR_RE.test(raw.color)) {
      r.error(
        `${path}.color`,
        `debe ser un color hex (#rgb, #rgba, #rrggbb o #rrggbbaa), no ${JSON.stringify(raw.color)}`,
      );
    }
    if (r.errors.length > before || !at) return null;
    return {
      ...base,
      text: raw.text as SkinTextDatum,
      at,
      size: raw.size as number,
      color: raw.color as string,
    };
  }

  warnUnknown(raw, IMAGE_KEYS, path, r);
  const problem =
    typeof raw.src === "string" ? skinPathProblem(raw.src) : "debe ser texto";
  if (problem) r.error(`${path}.src`, `ruta inválida: ${problem}`);

  let clip: SkinImageLayer["clip"];
  if (raw.clip !== undefined) {
    const c = raw.clip;
    if (!Array.isArray(c) || c.length !== 4 || !c.every(isFiniteNumber)) {
      r.error(`${path}.clip`, "debe ser `[x, y, ancho, alto]`");
    } else {
      const [x, y, w, h] = c as [number, number, number, number];
      if (
        w <= 0 ||
        h <= 0 ||
        x < 0 ||
        y < 0 ||
        x + w > scene[0] ||
        y + h > scene[1]
      ) {
        r.error(
          `${path}.clip`,
          `el recorte [${c.join(", ")}] debe tener ancho y alto positivos y caber en la escena ${scene[0]}×${scene[1]}`,
        );
      } else {
        clip = [x, y, w, h];
      }
    }
  }

  let frames: number | undefined;
  if (raw.frames !== undefined) {
    const F = SKIN_LIMITS.frames;
    if (
      !isFiniteNumber(raw.frames) ||
      !Number.isInteger(raw.frames) ||
      raw.frames < F.min ||
      raw.frames > F.max
    ) {
      r.error(`${path}.frames`, `debe ser un entero entre ${F.min} y ${F.max}`);
    } else {
      frames = raw.frames;
    }
  }

  let beats: number | undefined;
  if (raw.beats !== undefined) {
    const B = SKIN_ANIMATION_LIMITS.beats;
    if (raw.frames === undefined) {
      r.error(
        `${path}.beats`,
        "solo tiene sentido con `frames` (tira de fotogramas)",
      );
    } else if (
      !isFiniteNumber(raw.beats) ||
      raw.beats <= B.min ||
      raw.beats > B.max
    ) {
      r.error(
        `${path}.beats`,
        `debe ser un número mayor que ${B.min} y como mucho ${B.max}`,
      );
    } else {
      beats = raw.beats;
    }
  }

  let role: SkinLayerRole | undefined;
  if (raw.role !== undefined) {
    if (raw.role === "head" || raw.role === "player") role = raw.role;
    else {
      r.warn(
        `${path}.role`,
        `rol ${JSON.stringify(raw.role)} desconocido, se ignora (admitidos: "head", "player")`,
      );
    }
  }

  let anchor: [number, number] | undefined;
  let scale: number | undefined;
  if (role) {
    if (raw.anchor === undefined) {
      r.error(
        `${path}.anchor`,
        role === "head"
          ? 'la capa con role "head" necesita `anchor` [x, y]: dónde caen los cascos y la pantalla; sin él saldrían donde la cabeza de BIT'
          : 'la capa con role "player" necesita `anchor` [x, y]: dónde se centra la pantalla «sonando»',
      );
    } else {
      anchor = pair(raw.anchor, `${path}.anchor`, r, scene) ?? undefined;
    }
    if (raw.scale !== undefined) {
      if (
        !isFiniteNumber(raw.scale) ||
        raw.scale <= 0 ||
        raw.scale > SKIN_HEAD_SCALE_MAX
      ) {
        r.error(
          `${path}.scale`,
          `debe ser un número mayor que 0 y como mucho ${SKIN_HEAD_SCALE_MAX}`,
        );
      } else {
        scale = raw.scale;
      }
    }
  } else {
    for (const key of ["anchor", "scale"]) {
      if (raw[key] !== undefined) {
        r.warn(
          `${path}.${key}`,
          'solo tiene efecto con role "head" o "player", se ignora',
        );
      }
    }
  }

  // Solo se guardan apagados: un manifest que no los usa queda igual que antes.
  const off: { headphones?: false; player?: false } = {};
  for (const key of ["headphones", "player"] as const) {
    if (raw[key] === undefined) continue;
    if (role !== "head") {
      r.warn(`${path}.${key}`, 'solo tiene efecto con role "head", se ignora');
    } else if (typeof raw[key] !== "boolean") {
      r.error(`${path}.${key}`, "debe ser `true` o `false`");
    } else if (raw[key] === false) {
      off[key] = false;
    }
  }

  // Como los de arriba, solo se guarda encendido.
  let identity = false;
  if (raw.identity !== undefined) {
    if (typeof raw.identity !== "boolean") {
      r.error(`${path}.identity`, "debe ser `true` o `false`");
    } else {
      identity = raw.identity;
    }
  }

  if (r.errors.length > before) return null;
  return {
    ...base,
    src: raw.src as string,
    ...(clip && { clip }),
    ...(frames !== undefined && { frames }),
    ...(beats !== undefined && { beats }),
    ...(role && { role }),
    ...(anchor && { anchor }),
    ...(scale !== undefined && { scale }),
    ...off,
    ...(identity && { identity: true as const }),
  };
}

function checkAnimations(
  raw: unknown,
  r: Report,
): Record<string, SkinAnimation> {
  const out: Record<string, SkinAnimation> = {};
  if (raw === undefined) return out;
  if (!isRecord(raw)) {
    r.error("animations", "debe ser un objeto {nombre: animación}");
    return out;
  }
  const names = Object.keys(raw);
  if (names.length > SKIN_LIMITS.animations) {
    r.error(
      "animations",
      `como mucho ${SKIN_LIMITS.animations} animaciones propias`,
    );
    return out;
  }
  for (const name of names) {
    const path = `animations.${name}`;
    if (!isSkinAnimationName(name)) {
      r.error(
        path,
        "el nombre debe cumplir ^[a-z][a-z0-9-]{0,31}$ (minúsculas, números y guiones)",
      );
      continue;
    }
    if (Object.hasOwn(SERIES_ANIMATIONS, name)) {
      r.error(path, "ya es una animación de serie; elige otro nombre");
      continue;
    }
    const checked = validateSkinAnimation(raw[name]);
    if ("errors" in checked) {
      for (const e of checked.errors) {
        r.errors.push(
          e.startsWith("la animación") ? `${path}: ${e}` : `${path}.${e}`,
        );
      }
    } else {
      out[name] = checked.animation;
    }
  }
  return out;
}

const ROOT_KEYS = ["name", "size", "animations", "states"];

/**
 * Valida un `skin.json` llegado de fuera. Los errores nombran estado y campo;
 * lo que una versión más nueva de Amnis podría traer se ignora con aviso. El
 * manifest devuelto se construye campo a campo: nada desconocido pasa.
 */
export function validateSkinManifest(raw: unknown): SkinManifestResult {
  const r = new Report();
  if (!isRecord(raw))
    return { errors: ["el manifest debe ser un objeto JSON"] };
  warnUnknown(raw, ROOT_KEYS, "", r);

  let name: string | undefined;
  if (raw.name !== undefined) {
    if (
      typeof raw.name !== "string" ||
      raw.name.length < 1 ||
      raw.name.length > SKIN_LIMITS.name
    ) {
      r.error(
        "name",
        `debe ser un texto de 1 a ${SKIN_LIMITS.name} caracteres`,
      );
    } else {
      name = raw.name;
    }
  }

  let size: [number, number] = [SKIN_SCENE.width, SKIN_SCENE.height];
  if (raw.size !== undefined) {
    const s = raw.size;
    const ok =
      Array.isArray(s) &&
      s.length === 2 &&
      s.every((v) => Number.isInteger(v) && v > 0 && v <= SKIN_LIMITS.size);
    if (!ok) {
      r.error(
        "size",
        `debe ser \`[ancho, alto]\`, enteros de 1 a ${SKIN_LIMITS.size}`,
      );
    } else if (s[0] * SKIN_SCENE.height !== s[1] * SKIN_SCENE.width) {
      r.error(
        "size",
        `${s[0]}×${s[1]} no tiene la proporción de la escena (${SKIN_SCENE.width}×${SKIN_SCENE.height}, apaisada): se deformaría; prueba ${SKIN_SCENE.width * 2}×${SKIN_SCENE.height * 2}`,
      );
    } else {
      size = [s[0], s[1]];
    }
  }

  const animations = checkAnimations(raw.animations, r);
  const known = new Set([
    ...Object.keys(SERIES_ANIMATIONS),
    ...Object.keys(animations),
  ]);
  // Las capas se miden en el viewBox de la escena: `size` solo es la resolución de las imágenes.
  const scene: [number, number] = [SKIN_SCENE.width, SKIN_SCENE.height];

  const states: SkinManifest["states"] = {};
  if (!isRecord(raw.states)) {
    r.error("states", "falta o no es un objeto {estado: {layers: [...]}}");
  } else {
    for (const [state, def] of Object.entries(raw.states)) {
      const spath = `states.${state}`;
      if (!SKIN_STATES.includes(state as PetState)) {
        r.warn(
          spath,
          `estado desconocido, se ignora (admitidos: ${SKIN_STATES.join(", ")})`,
        );
        continue;
      }
      if (!isRecord(def) || !Array.isArray(def.layers)) {
        r.error(`${spath}.layers`, "debe ser una lista de capas");
        continue;
      }
      warnUnknown(def, ["layers"], spath, r);
      const L = SKIN_LIMITS.layers;
      if (def.layers.length < L.min || def.layers.length > L.max) {
        r.error(
          `${spath}.layers`,
          `debe tener entre ${L.min} y ${L.max} capas`,
        );
        continue;
      }
      const layers: SkinLayer[] = [];
      const roles: Record<SkinLayerRole, number[]> = { head: [], player: [] };
      def.layers.forEach((l, i) => {
        const layer = checkLayer(l, `${spath}.layers[${i}]`, scene, known, r);
        if (!layer) return;
        if (!isSkinTextLayer(layer) && layer.role) roles[layer.role].push(i);
        layers.push(layer);
      });
      for (const role of ["head", "player"] as const) {
        if (roles[role].length > 1) {
          r.error(
            spath,
            `como mucho una capa con role "${role}" por estado (capas ${roles[role].join(" y ")})`,
          );
        }
      }
      const head = roles.head[0];
      if (
        head !== undefined &&
        roles.player.length > 0 &&
        def.layers[head]?.player === false
      ) {
        r.warn(
          `${spath}.layers[${head}].player`,
          'el estado tiene capa con role "player": la pantalla «sonando» va en ella, se ignora',
        );
      }
      states[state as PetState] = { layers };
    }
    if (Object.keys(states).length === 0 && r.errors.length === 0) {
      r.error(
        "states",
        "no declara ningún estado conocido: una skin necesita al menos uno",
      );
    }
  }

  if (r.errors.length > 0) return { errors: r.errors };
  return {
    manifest: { ...(name !== undefined && { name }), size, animations, states },
    warnings: r.warnings,
  };
}
