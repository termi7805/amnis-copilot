import type { QuotaHistoryResponse, QuotaSnapshot } from "@amnis/shared";
import i18n from "../i18n/index.ts";

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
  /**
   * `false` sin endpoint y con la estimación local sin calibrar: `used` sale
   * de un techo inicial que no guarda relación con los tokens que cuenta
   * Amnis (#103) y no es un `%` que enseñar.
   */
  known: boolean;
  /**
   * Sin endpoint y con 1-2 ventanas cerradas (#117): `used` sale de un techo
   * provisional, no calibrado. `windows` es el `n` de `n/3`. `null` en otro caso.
   */
  provisional: { windows: number } | null;
}

/** Ventanas cerradas para fiarse del techo; duplica `MIN_CEILING_WINDOWS` del daemon. */
export const CEILING_WINDOWS_NEEDED = 3;

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
    : new Date(
        (quota.local.windowStartedAt
          ? new Date(quota.local.windowStartedAt)
          : now
        ).getTime() + FIVE_HOUR_MS,
      );
  const start = new Date(end.getTime() - FIVE_HOUR_MS);
  const elapsedPct = clamp(
    ((now.getTime() - start.getTime()) / FIVE_HOUR_MS) * 100,
    0,
    100,
  );
  const provisionalPct =
    auth === null && !quota.local.calibrated
      ? quota.local.provisionalUtilization
      : null;
  return {
    start,
    end,
    elapsedPct,
    used:
      auth?.utilization ?? provisionalPct ?? quota.local.fiveHourUtilization,
    estimated: auth === null,
    known: auth !== null || quota.local.calibrated || provisionalPct !== null,
    provisional:
      provisionalPct !== null ? { windows: quota.local.ceilingWindows } : null,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Por encima de esto el ritmo lineal ya roza el límite. */
const TIGHT_PACE = 0.85;

export type Pace = "exhausted" | "over" | "tight" | "margin" | "starting";

/**
 * Clasificación de ritmo que comparten el titular y la pastilla (#118), para
 * que no puedan discrepar. `ratio` = uso / tiempo; 1 es "justo al ritmo
 * lineal". Con la ventana recién abierta no hay ritmo que medir.
 */
export function paceLevel(window: FiveHourWindow): Pace {
  if (window.used >= 100) return "exhausted";
  if (window.elapsedPct < 3) return "starting";
  const ratio = window.used / window.elapsedPct;
  if (ratio >= 1) return "over";
  if (ratio >= TIGHT_PACE) return "tight";
  return "margin";
}

export interface PaceHeadline {
  title: string;
  detail: string;
}

/**
 * El titular sale de comparar uso y tiempo transcurrido (`paceLevel`), no de
 * umbrales de uso: 34 % gastado con el 55 % del tiempo pasado no es 34 % con
 * el 10 %. Con la ventana recién abierta se habla solo del uso.
 */
export function paceHeadline(
  window: FiveHourWindow,
  projectedAtReset: number | null,
): PaceHeadline {
  if (!window.known) {
    return {
      title: i18n.t("now.pace.unknownTitle"),
      detail: i18n.t("now.pace.unknownDetail"),
    };
  }
  const used = Math.round(window.used);
  const elapsed = Math.round(window.elapsedPct);
  const prefix = window.estimated ? "~" : "";
  const measured = i18n.t("now.pace.measured", {
    used: `${prefix}${used}`,
    elapsed,
  });
  const source = window.provisional
    ? i18n.t("now.pace.provisional", {
        windows: window.provisional.windows,
        needed: CEILING_WINDOWS_NEEDED,
      })
    : window.estimated
      ? i18n.t("now.pace.estimated")
      : "";

  const pace = paceLevel(window);
  if (pace === "starting") {
    return {
      title: i18n.t("now.pace.starting"),
      detail: `${measured}${source}`,
    };
  }
  const title = i18n.t(`now.pace.${pace}`);
  const detail =
    !window.estimated && projectedAtReset !== null
      ? i18n.t("now.pace.projected", { pct: Math.round(projectedAtReset) })
      : `${measured}${source}`;
  return { title, detail };
}

export type PillTone = "ok" | "warn" | "crit" | "neutral";

const TONE_RANK: Record<PillTone, number> = {
  neutral: 0,
  ok: 1,
  warn: 2,
  crit: 3,
};

const PACE_TONE: Record<Exclude<Pace, "starting">, PillTone> = {
  exhausted: "crit",
  over: "crit",
  tight: "warn",
  margin: "ok",
};

/**
 * La pastilla sale del mismo ritmo que el titular (`paceLevel`, #118); la
 * `severity` del límite de sesión que calcula Anthropic solo la endurece:
 * `severity` mide cuánto se ha gastado, no a qué velocidad (#91), pero
 * Anthropic sabe cosas del límite que el ritmo no ve. Gana el más grave; con
 * la ventana recién empezada, la `severity` tal cual. Una severidad
 * desconocida se muestra tal cual salvo que el ritmo ya avise.
 */
export function severityPill(
  quota: QuotaSnapshot,
  window: FiveHourWindow,
): {
  tone: PillTone;
  label: string;
} {
  if (!quota.authoritative)
    return { tone: "neutral", label: i18n.t("now.pill.estimated") };
  const limit = quota.authoritative.limits.find(
    (l) => l.kind === "session" && l.scope === null,
  );
  const bySeverity = ((): { tone: PillTone; label: string } => {
    switch (limit?.severity) {
      case "normal":
        return { tone: "ok", label: i18n.t("now.pill.normal") };
      case "warning":
        return { tone: "warn", label: i18n.t("now.pill.warning") };
      case "critical":
        return { tone: "crit", label: i18n.t("now.pill.critical") };
      default:
        return {
          tone: "neutral",
          label: limit?.severity ?? i18n.t("now.pill.noSeverity"),
        };
    }
  })();
  const pace = paceLevel(window);
  if (pace === "starting") return bySeverity;
  const byPace = {
    tone: PACE_TONE[pace],
    label: i18n.t(`now.pill.${pace}`),
  };
  // Una severidad desconocida no se pisa con un "todo bien" del ritmo.
  if (bySeverity.tone === "neutral" && byPace.tone === "ok") return bySeverity;
  return TONE_RANK[bySeverity.tone] > TONE_RANK[byPace.tone]
    ? bySeverity
    : byPace;
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

export type Exhaustion =
  /** Sin endpoint: no hay ritmo real que extrapolar. */
  | { kind: "hidden" }
  | { kind: "exhausted" }
  /** Pocas muestras para medir un ritmo. */
  | { kind: "unknown" }
  /** El uso llega al reset: ritmo 0, o el 100 % cae después de él. */
  | { kind: "lasts" }
  | { kind: "at"; at: Date };

/**
 * Qué decir de la hora de agotarse (#119); lo comparten la tarjeta y la
 * mascota. El daemon no recorta la hora al reset: que el 100 % caiga después
 * de él significa que la ventana se cierra antes, y eso se decide aquí.
 * Ritmo 0 = hay proyección pero ninguna hora.
 */
export function fiveHourExhaustion(
  quota: QuotaSnapshot,
  window: FiveHourWindow,
): Exhaustion {
  if (window.estimated) return { kind: "hidden" };
  if (window.used >= 100) return { kind: "exhausted" };
  if (quota.projection.fiveHourAtReset === null) return { kind: "unknown" };
  const iso = quota.projection.fiveHourExhaustsAt;
  if (iso === null) return { kind: "lasts" };
  const at = new Date(iso);
  return at >= window.end ? { kind: "lasts" } : { kind: "at", at };
}
