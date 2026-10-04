import {
  type DaemonMessage,
  DEFAULT_MUSIC_PREFS,
  type MusicPrefs,
  msg,
} from "@amnis/shared";

export type MusicPrefsResult =
  | { ok: true; prefs: MusicPrefs }
  | { ok: false; field: string; message: DaemonMessage };

/** Comprobación de un campo y cómo se describe lo que espera. */
interface Rule {
  check: (value: unknown) => boolean;
  expected: DaemonMessage;
}

const oneOf = (...allowed: readonly string[]): Rule => ({
  check: (v) => typeof v === "string" && allowed.includes(v),
  expected: msg("validation.oneOf", {
    values: allowed.map((a) => `"${a}"`).join(", "),
  }),
});

const inRange = (min: number, max: number): Rule => ({
  check: (v) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max,
  expected: msg("validation.range", { min, max }),
});

const isBoolean: Rule = {
  check: (v) => typeof v === "boolean",
  expected: msg("validation.boolean"),
};

const RULES: Record<keyof MusicPrefs, Rule> = {
  enabled: isBoolean,
  motion: oneOf("head", "accessory"),
  damping: inRange(0, 1),
  color: oneOf("vibe", "cover", "teal"),
  fallback: oneOf("neutral", "quiet"),
  screen: oneOf("two-phase", "cover", "cover-title", "pixel", "text", "none"),
  screenSeconds: inRange(2, 8),
  screenEntry: oneOf("tv", "fade"),
  scanlines: isBoolean,
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
    return { ok: false, field: "body", message: msg("body.notObject") };
  }
  const changes = input as Record<string, unknown>;
  const next: Record<string, unknown> = { ...current };

  for (const field of Object.keys(changes)) {
    if (!FIELDS.includes(field as keyof MusicPrefs)) {
      return {
        ok: false,
        field,
        message: msg("validation.unknownField", { field }),
      };
    }
    const { check, expected } = RULES[field as keyof MusicPrefs];
    if (!check(changes[field])) {
      return {
        ok: false,
        field,
        message: msg("validation.field", { field, expected }),
      };
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
