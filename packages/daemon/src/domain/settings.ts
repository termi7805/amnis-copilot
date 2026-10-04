import {
  type AmnisSettings,
  type DaemonMessage,
  DEFAULT_SETTINGS,
  isLocaleId,
  isThemeId,
  LOCALES,
  msg,
  type PetFocus,
  THEMES,
} from "@amnis/shared";
import { sanitizeMusicPrefs, validateMusicPrefs } from "./musicPrefs.ts";
import { PLANS } from "./plans.ts";
import { parseVersion } from "./version.ts";

export type SettingsResult =
  | { ok: true; settings: AmnisSettings }
  | { ok: false; field: string; message: DaemonMessage };

function isDismissedUpdate(v: unknown): v is string | null {
  return v === null || (typeof v === "string" && parseVersion(v) !== null);
}

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
 * Valida un cambio de ajustes (`PUT /api/settings`): `plan`, `petFocus`, `theme`, `locale` y `checkUpdates` aquí,
 * el resto (preferencias de música) en `validateMusicPrefs`. Acepta un
 * parcial.
 */
export function validateSettings(
  input: unknown,
  current: AmnisSettings,
): SettingsResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, field: "body", message: msg("body.notObject") };
  }
  const {
    plan,
    petFocus,
    theme,
    locale,
    checkUpdates,
    dismissedUpdate,
    ...rest
  } = input as Record<string, unknown>;

  let nextPlan = current.plan;
  if ("plan" in input) {
    if (!isKnownPlan(plan)) {
      return {
        ok: false,
        field: "plan",
        message: msg("settings.invalidPlan", {
          allowed: Object.keys(PLANS).join(", "),
        }),
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
        message: msg("settings.invalidPetFocus"),
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
        message: msg("settings.invalidTheme", {
          allowed: THEMES.map((t) => t.id).join(", "),
        }),
      };
    }
    nextTheme = theme;
  }

  let nextLocale = current.locale;
  if ("locale" in input) {
    if (!isLocaleId(locale)) {
      return {
        ok: false,
        field: "locale",
        message: msg("settings.invalidLocale", { allowed: LOCALES.join(", ") }),
      };
    }
    nextLocale = locale;
  }

  let nextCheckUpdates = current.checkUpdates;
  if ("checkUpdates" in input) {
    if (typeof checkUpdates !== "boolean") {
      return {
        ok: false,
        field: "checkUpdates",
        message: msg("validation.field", {
          field: "checkUpdates",
          expected: msg("validation.boolean"),
        }),
      };
    }
    nextCheckUpdates = checkUpdates;
  }

  let nextDismissed = current.dismissedUpdate;
  if ("dismissedUpdate" in input) {
    if (!isDismissedUpdate(dismissedUpdate)) {
      return {
        ok: false,
        field: "dismissedUpdate",
        message: msg("validation.field", {
          field: "dismissedUpdate",
          expected: msg("validation.version"),
        }),
      };
    }
    nextDismissed = dismissedUpdate;
  }

  const {
    plan: _plan,
    petFocus: _petFocus,
    theme: _theme,
    locale: _locale,
    checkUpdates: _checkUpdates,
    dismissedUpdate: _dismissedUpdate,
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
      locale: nextLocale,
      checkUpdates: nextCheckUpdates,
      dismissedUpdate: nextDismissed,
    },
  };
}

/**
 * Lo que se lee de disco: nunca lanza; un `plan` inválido cae a `null`, un
 * `petFocus` inválido o ausente, a `auto`, y un `theme` o un `locale` desconocidos, a `system`.
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
    locale: isLocaleId(source.locale) ? source.locale : "system",
    checkUpdates:
      typeof source.checkUpdates === "boolean" ? source.checkUpdates : true,
    dismissedUpdate: isDismissedUpdate(source.dismissedUpdate)
      ? source.dismissedUpdate
      : null,
  };
}
