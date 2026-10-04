import type { AmnisSettings, LocaleId } from "@amnis/shared";
import { useCallback, useEffect, useState } from "react";
import { type SaveSettingsResult, saveSettings } from "../api/settings.ts";
import i18n, {
  LOCALE_KEY,
  readLocaleCache,
  resolveLocale,
} from "../i18n/index.ts";

/** Cambia el idioma de i18next y `<html lang>`, y refresca la caché de primer pintado. */
export function applyLocale(locale: LocaleId) {
  const language = resolveLocale(locale);
  document.documentElement.lang = language;
  if (i18n.language !== language) void i18n.changeLanguage(language);
  try {
    if (locale === "system") localStorage.removeItem(LOCALE_KEY);
    else localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Sin almacenamiento solo se pierde el primer pintado de la próxima carga.
  }
}

/**
 * El idioma elegido, tomado de los ajustes del daemon como `useTheme`: cuando
 * llegan, gana el daemon. Elegir uno lo aplica al momento y lo guarda por
 * `PUT /api/settings`; el SSE lo reparte a la otra ventana.
 */
export function useLocale(
  settings: AmnisSettings | undefined,
  save: typeof saveSettings = saveSettings,
): [LocaleId, (locale: LocaleId) => Promise<SaveSettingsResult>] {
  const [locale, setLocaleState] = useState<LocaleId>(readLocaleCache);
  const daemonLocale = settings?.locale;

  useEffect(() => {
    if (daemonLocale === undefined) return;
    applyLocale(daemonLocale);
    setLocaleState(daemonLocale);
  }, [daemonLocale]);

  const setLocale = useCallback(
    (next: LocaleId) => {
      applyLocale(next);
      setLocaleState(next);
      return save({ locale: next });
    },
    [save],
  );
  return [locale, setLocale];
}
