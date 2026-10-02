import type { QuotaHistoryResponse, QuotaSnapshot } from "@amnis/shared";

export const FIVE_HOUR_MS = 5 * 60 * 60_000;

export interface FiveHourWindow {
  start: Date;
  end: Date;
  /** 0-100: cuánto de la ventana ha pasado. */
  elapsedPct: number;
  /** `%` mostrado: el del endpoint, o la estimación local si no hay. */
  used: number;
  /** Sin endpoint: el número lleva `~` y proyección/divergencia se ocultan. */
  estimated: boolean;
}

/**
 * La ventana es fija (DESIGN §2): con endpoint arranca en `resets_at − 5 h`;
 * sin él, en el inicio inferido por el daemon desde los JSONL.
 */
export function fiveHourWindow(
  quota: QuotaSnapshot,
  now: Date,
): FiveHourWindow {
  const auth = quota.authoritative?.fiveHour ?? null;
  const end = auth?.resetsAt
    ? new Date(auth.resetsAt)
    : new Date(new Date(quota.local.windowStartedAt).getTime() + FIVE_HOUR_MS);
  const start = new Date(end.getTime() - FIVE_HOUR_MS);
  const elapsedPct = clamp(
    ((now.getTime() - start.getTime()) / FIVE_HOUR_MS) * 100,
    0,
    100,
  );
  return {
    start,
    end,
    elapsedPct,
    used: auth?.utilization ?? quota.local.fiveHourUtilization,
    estimated: auth === null,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Por encima de esto el ritmo lineal ya roza el límite. */
const TIGHT_PACE = 0.85;

export interface PaceHeadline {
  title: string;
  detail: string;
}

/**
 * El titular sale de comparar uso y tiempo transcurrido, no de umbrales de
 * uso: 34 % gastado con el 55 % del tiempo pasado no es 34 % con el 10 %.
 * `ratio` = uso / tiempo; 1 es "justo al ritmo lineal". Con la ventana recién
 * abierta no hay ritmo que medir y se habla solo del uso.
 */
export function paceHeadline(
  window: FiveHourWindow,
  projectedAtReset: number | null,
): PaceHeadline {
  const used = Math.round(window.used);
  const elapsed = Math.round(window.elapsedPct);
  const prefix = window.estimated ? "~" : "";
  const measured = `Llevas ${prefix}${used} % con el ${elapsed} % de la ventana pasado.`;
  const source = window.estimated
    ? " Es una estimación local: sin el endpoint no hay proyección."
    : "";

  if (window.elapsedPct < 3 && window.used < 100) {
    return {
      title: "La ventana acaba de empezar",
      detail: `${measured}${source}`,
    };
  }
  const ratio = window.used / window.elapsedPct;
  const title =
    window.used >= 100
      ? "Has agotado esta ventana"
      : ratio >= 1
        ? "A este ritmo no llegas al reset"
        : ratio >= TIGHT_PACE
          ? "Vas justo para esta ventana"
          : "Te queda margen para esta ventana";
  const detail =
    !window.estimated && projectedAtReset !== null
      ? `A este ritmo cierras la ventana de 5 h al ${Math.round(projectedAtReset)} %.`
      : `${measured}${source}`;
  return { title, detail };
}

export type PillTone = "ok" | "warn" | "crit" | "neutral";

/**
 * La pastilla sale de la `severity` del límite de sesión que calcula
 * Anthropic, no de umbrales propios (#91). Una severidad desconocida se
 * muestra tal cual en vez de descartarse.
 */
export function severityPill(quota: QuotaSnapshot): {
  tone: PillTone;
  label: string;
} {
  if (!quota.authoritative) return { tone: "neutral", label: "estimado" };
  const limit = quota.authoritative.limits.find(
    (l) => l.kind === "session" && l.scope === null,
  );
  switch (limit?.severity) {
    case "normal":
      return { tone: "ok", label: "Ritmo sostenible" };
    case "warning":
      return { tone: "warn", label: "Ritmo alto" };
    case "critical":
      return { tone: "crit", label: "Al límite" };
    default:
      return { tone: "neutral", label: limit?.severity ?? "sin severidad" };
  }
}

export const SPARK_W = 600;
export const SPARK_H = 64;
const SPARK_PAD = 4;

export type Point = [x: number, y: number];

/** `%` → y del viewBox de la sparkline (0 % abajo, 100 % arriba). */
export function sparkY(percent: number): number {
  return (
    SPARK_H -
    SPARK_PAD -
    (clamp(percent, 0, 100) / 100) * (SPARK_H - 2 * SPARK_PAD)
  );
}

/** Fecha → x del viewBox: la ventana completa ocupa todo el ancho. */
export function sparkX(at: Date, window: FiveHourWindow): number {
  const t = (at.getTime() - window.start.getTime()) / FIVE_HOUR_MS;
  return clamp(t, 0, 1) * SPARK_W;
}

/**
 * Serie de la ventana actual: `fiveHour` con endpoint, `local` sin él (las
 * muestras antiguas con `fiveHour: null` se saltan, no se dibujan como 0).
 */
export function sparkPoints(
  samples: QuotaHistoryResponse["samples"],
  window: FiveHourWindow,
): Point[] {
  const out: Point[] = [];
  for (const s of samples) {
    const at = new Date(s.at);
    if (at < window.start || at > window.end) continue;
    const value = window.estimated ? s.local : s.fiveHour;
    if (value === null) continue;
    out.push([sparkX(at, window), sparkY(value)]);
  }
  return out;
}
