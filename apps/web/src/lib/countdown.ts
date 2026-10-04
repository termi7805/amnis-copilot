import { useEffect, useState } from "react";
import i18n from "../i18n/index.ts";

/**
 * `null` si `resetsAt` es `null` — no hay cuenta atrás que dar, y quien
 * llama decide qué poner en su lugar (no es cosa de esta función).
 * Ya pasado → "ahora": la ventana venció pero aún no se ha vuelto a
 * muestrear, y un número negativo sería basura.
 */
export function formatUntil(resetsAt: string | null, now: Date): string | null {
  if (!resetsAt) return null;

  const ms = new Date(resetsAt).getTime() - now.getTime();
  if (ms <= 0) return i18n.t("common.countdown.now");

  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) {
    return i18n.t("common.countdown.days", { days, hours: hours % 24 });
  }
  if (hours >= 1) {
    return i18n.t("common.countdown.hours", { hours, minutes: minutes % 60 });
  }
  return i18n.t("common.countdown.minutes", { minutes });
}

/**
 * Simétrica a `formatUntil`, pero "cuánto ha pasado desde" en vez de
 * "cuánto falta para" — la fila de actividad del panel 3b necesita
 * "12 min" desde `pet.since`, no una cuenta atrás.
 */
export function formatElapsed(since: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(since).getTime());

  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) {
    return i18n.t("common.countdown.days", { days, hours: hours % 24 });
  }
  if (hours >= 1) {
    return i18n.t("common.countdown.hours", { hours, minutes: minutes % 60 });
  }
  return i18n.t("common.countdown.minutesLong", { minutes });
}

/**
 * Un solo reloj para todo el dashboard, en vez de un temporizador por
 * anillo. 30 s de cadencia: la cuenta atrás se muestra en minutos, así
 * que un tic por segundo serían renders que no cambian nada visible.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
