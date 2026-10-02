import { type AmnisSettings, DEFAULT_SETTINGS } from "@amnis/shared";
import { sanitizeMusicPrefs, validateMusicPrefs } from "./musicPrefs.ts";
import { PLANS } from "./plans.ts";

export type SettingsResult =
  | { ok: true; settings: AmnisSettings }
  | { ok: false; field: string; message: string };

function isKnownPlan(v: unknown): v is string | null {
  return v === null || (typeof v === "string" && v in PLANS);
}

/**
 * Valida un cambio de ajustes (`PUT /api/settings`): `plan` aquí, el resto
 * (preferencias de música) en `validateMusicPrefs`. Acepta un parcial.
 */
export function validateSettings(
  input: unknown,
  current: AmnisSettings,
): SettingsResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, field: "body", message: "El body debe ser un objeto." };
  }
  const { plan, ...rest } = input as Record<string, unknown>;

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

  const { plan: _plan, ...currentPrefs } = current;
  const prefs = validateMusicPrefs(rest, currentPrefs);
  if (!prefs.ok) return prefs;
  return { ok: true, settings: { ...prefs.prefs, plan: nextPlan } };
}

/** Lo que se lee de disco: nunca lanza; un `plan` inválido cae a `null`. */
export function sanitizeSettings(raw: unknown): AmnisSettings {
  const plan =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>).plan
      : null;
  return {
    ...DEFAULT_SETTINGS,
    ...sanitizeMusicPrefs(raw),
    plan: isKnownPlan(plan) ? plan : null,
  };
}
