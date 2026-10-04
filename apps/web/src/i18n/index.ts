import {
  type DaemonMessage,
  formatMessage,
  isDaemonMessage,
  type LocaleId,
} from "@amnis/shared";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en.ts";
import { es } from "./es.ts";

export type Language = "es" | "en";

/**
 * Caché de primer pintado, nunca fuente de verdad: el idioma vive en
 * `settings.json` del daemon, como el tema. Sin ella, cada carga en inglés
 * pintaría primero en español hasta que llegan los ajustes por SSE.
 */
export const LOCALE_KEY = "amnis-locale";

/** «Sistema»: español si el navegador o el webview lo está; si no, inglés. */
export function resolveLocale(id: LocaleId): Language {
  if (id !== "system") return id;
  return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

export function readLocaleCache(): LocaleId {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    return stored === "es" || stored === "en" ? stored : "system";
  } catch {
    return "system";
  }
}

// `initAsync: false` deja los recursos cargados antes del primer render.
void i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: resolveLocale(readLocaleCache()),
  fallbackLng: "es",
  interpolation: { escapeValue: false },
  initAsync: false,
});
document.documentElement.lang = i18n.language;

export function language(): Language {
  return i18n.language === "en" ? "en" : "es";
}

/** Locale de `Intl`: la región fija el formato de horas y cifras. */
export function intlLocale(): string {
  return language() === "en" ? "en-US" : "es-ES";
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** `Intl.DateTimeFormat` del idioma activo, memorizado por idioma y opciones. */
export function dateFormat(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${intlLocale()}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocale(), options);
    dateFormats.set(key, format);
  }
  return format;
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return value.toLocaleString(intlLocale(), options);
}

/** Texto de un mensaje del daemon en el idioma activo; un daemon viejo aún manda frases. */
export function daemonText(message: DaemonMessage | string): string {
  return typeof message === "string"
    ? message
    : formatMessage(language(), message);
}

/** `error`/`remedy` de un cuerpo de error del daemon, sea mensaje o frase. */
export function daemonField(value: unknown): string | null {
  if (typeof value === "string") return value;
  return isDaemonMessage(value) ? daemonText(value) : null;
}

export default i18n;
