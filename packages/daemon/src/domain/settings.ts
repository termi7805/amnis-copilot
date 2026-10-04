import {
  type AmnisSettings,
  DEFAULT_SETTINGS,
  isThemeId,
  type PetFocus,
  THEMES,
} from "@amnis/shared";
import { sanitizeMusicPrefs, validateMusicPrefs } from "./musicPrefs.ts";
import { PLANS } from "./plans.ts";

export type SettingsResult =
  | { ok: true; settings: AmnisSettings }
  | { ok: false; field: string; message: string };

function isKnownPlan(v: unknown): v is string | null {
  return v === null || (typeof v === "string" && v in PLANS);
}

/** Campos de texto obligatorios de cada `kind` de foco. */
const FOCUS_FIELDS: Record<PetFocus["kind"], readonly string[]> = {
  auto: [],
  repo: ["repoRoot"],
  worktree: ["worktree"],
  session: ["sessionId", "worktree"],
};

/**
 * Forma válida de un foco, o `null`. Estricta como `validateMusicPrefs`: un
 * `kind` desconocido, un campo vacío o una clave de más (un typo) no pasan.
 * No comprueba que la ruta exista: eso es cosa de #110.
 */
function parsePetFocus(v: unknown): PetFocus | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const obj = v as Record<string, unknown>;
  const kind = obj.kind;
  if (typeof kind !== "string" || !Object.hasOwn(FOCUS_FIELDS, kind)) {
    return null;
  }
  const fields = FOCUS_FIELDS[kind as PetFocus["kind"]];
  if (Object.keys(obj).length !== fields.length + 1) return null;
  const out: Record<string, string> = { kind };
  for (const field of fields) {
    const value = obj[field];
    if (typeof value !== "string" || value === "") return null;
    out[field] = value;
  }
  return out as unknown as PetFocus;
}

/**
 * Valida un cambio de ajustes (`PUT /api/settings`): `plan`, `petFocus` y `theme` aquí,
 * el resto (preferencias de música) en `validateMusicPrefs`. Acepta un
 * parcial.
 */
export function validateSettings(
  input: unknown,
  current: AmnisSettings,
): SettingsResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, field: "body", message: "El body debe ser un objeto." };
  }
  const { plan, petFocus, theme, ...rest } = input as Record<string, unknown>;

  let nextPlan = current.plan;
  if ("plan" in input) {
    if (!isKnownPlan(plan)) {
      return {
        ok: false,
        field: "plan",
        message: `plan debe ser null o uno de: ${Object.keys(PLANS).join(", ")}.`,
      };
    }
    nextPlan = plan;
  }

  let nextFocus = current.petFocus;
  if ("petFocus" in input) {
    const parsed = parsePetFocus(petFocus);
    if (parsed === null) {
      return {
        ok: false,
        field: "petFocus",
        message:
          'petFocus debe ser {"kind":"auto"}, {"kind":"repo","repoRoot"}, {"kind":"worktree","worktree"} o {"kind":"session","sessionId","worktree"}, con textos no vacíos.',
      };
    }
    nextFocus = parsed;
  }

  let nextTheme = current.theme;
  if ("theme" in input) {
    if (!isThemeId(theme)) {
      return {
        ok: false,
        field: "theme",
        message: `theme debe ser uno de: ${THEMES.map((t) => t.id).join(", ")}.`,
      };
    }
    nextTheme = theme;
  }

  const {
    plan: _plan,
    petFocus: _petFocus,
    theme: _theme,
    ...currentPrefs
  } = current;
  const prefs = validateMusicPrefs(rest, currentPrefs);
  if (!prefs.ok) return prefs;
  return {
    ok: true,
    settings: {
      ...prefs.prefs,
      plan: nextPlan,
      petFocus: nextFocus,
      theme: nextTheme,
    },
  };
}

/**
 * Lo que se lee de disco: nunca lanza; un `plan` inválido cae a `null`, un
 * `petFocus` inválido o ausente, a `auto`, y un `theme` desconocido, a `system`.
 */
export function sanitizeSettings(raw: unknown): AmnisSettings {
  const source =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    ...DEFAULT_SETTINGS,
    ...sanitizeMusicPrefs(raw),
    plan: isKnownPlan(source.plan) ? source.plan : null,
    petFocus: parsePetFocus(source.petFocus) ?? { kind: "auto" },
    theme: isThemeId(source.theme) ? source.theme : "system",
  };
}
