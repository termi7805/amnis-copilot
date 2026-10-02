import { DEFAULT_MUSIC_PREFS, type MusicPrefs } from "@amnis/shared";

export type MusicPrefsResult =
  | { ok: true; prefs: MusicPrefs }
  | { ok: false; field: string; message: string };

type Rule = (value: unknown) => boolean;

const oneOf =
  (...allowed: readonly string[]): Rule =>
  (v) =>
    typeof v === "string" && allowed.includes(v);

const inRange =
  (min: number, max: number): Rule =>
  (v) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

const isBoolean: Rule = (v) => typeof v === "boolean";

/** Una regla por campo: es la única fuente de qué es válido. */
const RULES: Record<keyof MusicPrefs, { check: Rule; expected: string }> = {
  enabled: { check: isBoolean, expected: "true o false" },
  motion: {
    check: oneOf("head", "accessory"),
    expected: '"head" o "accessory"',
  },
  damping: { check: inRange(0, 1), expected: "un número entre 0 y 1" },
  color: {
    check: oneOf("vibe", "cover", "teal"),
    expected: '"vibe", "cover" o "teal"',
  },
  fallback: {
    check: oneOf("neutral", "quiet"),
    expected: '"neutral" o "quiet"',
  },
  screen: {
    check: oneOf("two-phase", "cover", "cover-title", "pixel", "text", "none"),
    expected: '"two-phase", "cover", "cover-title", "pixel", "text" o "none"',
  },
  screenSeconds: { check: inRange(2, 8), expected: "un número entre 2 y 8" },
  screenEntry: { check: oneOf("tv", "fade"), expected: '"tv" o "fade"' },
  scanlines: { check: isBoolean, expected: "true o false" },
};

const FIELDS = Object.keys(RULES) as (keyof MusicPrefs)[];

/**
 * Valida un cambio de preferencias (`PUT /api/settings`). Acepta un parcial: lo
 * que se envía se valida y se funde sobre `current`. Rechaza campos
 * desconocidos (un typo no puede pasar por "guardado") y dice **qué campo**
 * falla.
 */
export function validateMusicPrefs(
  input: unknown,
  current: MusicPrefs,
): MusicPrefsResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, field: "body", message: "El body debe ser un objeto." };
  }
  const changes = input as Record<string, unknown>;
  const next: Record<string, unknown> = { ...current };

  for (const field of Object.keys(changes)) {
    if (!FIELDS.includes(field as keyof MusicPrefs)) {
      return { ok: false, field, message: `Campo desconocido: ${field}.` };
    }
    const { check, expected } = RULES[field as keyof MusicPrefs];
    if (!check(changes[field])) {
      return { ok: false, field, message: `${field} debe ser ${expected}.` };
    }
    next[field] = changes[field];
  }
  return { ok: true, prefs: next as unknown as MusicPrefs };
}

/**
 * Lo que se lee de disco, sea lo que sea: campo a campo, lo ausente o inválido
 * toma el valor por defecto y lo válido se conserva. Nunca lanza: un
 * `settings.json` estropeado no puede tumbar el daemon.
 */
export function sanitizeMusicPrefs(raw: unknown): MusicPrefs {
  const out: Record<string, unknown> = { ...DEFAULT_MUSIC_PREFS };
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const source = raw as Record<string, unknown>;
    for (const field of FIELDS) {
      if (RULES[field].check(source[field])) out[field] = source[field];
    }
  }
  return out as unknown as MusicPrefs;
}
