import type { ActivityGroup, ActivitySegment, QuotaLimit } from "@amnis/shared";

const WEEK_MS = 7 * 24 * 60 * 60_000;
/** Margen en puntos porcentuales para llamar "al ritmo" a lo que está cerca del lineal. */
const ON_PACE_MARGIN = 5;

/**
 * Límites semanales con alcance propio (un modelo u otro `scope`): los que
 * una cuenta tiene o no tiene. Sin ninguno, la vista no pinta tarjeta alguna
 * de modelo, ni vacía ni al 0 %.
 */
export function modelLimits(limits: QuotaLimit[]): QuotaLimit[] {
  return limits.filter((l) => l.group === "weekly" && l.scope !== null);
}

/** `fable` → `Fable`; un scope desconocido se muestra tal cual, solo con inicial. */
export function scopeTitle(scope: string): string {
  return scope.charAt(0).toUpperCase() + scope.slice(1);
}

export interface WeeklyPace {
  /** 1–7: en qué día de la ventana de 7 d estamos. */
  day: number;
  /** 0-100: cuánto de la ventana ha pasado. */
  elapsedPct: number;
  verdict: "below" | "on" | "above";
}

/**
 * Uso frente al ritmo lineal de la semana. La ventana arranca en
 * `resetsAt − 7 d`. Sin `resetsAt` no hay ritmo que medir: `null`.
 */
export function weeklyPace(
  utilization: number,
  resetsAt: string | null,
  now: Date,
): WeeklyPace | null {
  if (!resetsAt) return null;
  const end = new Date(resetsAt).getTime();
  const elapsed = Math.min(
    WEEK_MS,
    Math.max(0, now.getTime() - (end - WEEK_MS)),
  );
  const elapsedPct = (elapsed / WEEK_MS) * 100;
  const gap = utilization - elapsedPct;
  return {
    day: Math.min(7, Math.floor(elapsed / (24 * 60 * 60_000)) + 1),
    elapsedPct,
    verdict:
      gap < -ON_PACE_MARGIN ? "below" : gap > ON_PACE_MARGIN ? "above" : "on",
  };
}

/**
 * Reparte `n` tarjetas en filas de como mucho `max`, lo más parejas posible:
 * `5 → [3, 2]`, `13 → [4, 3, 3, 3]`. Nunca deja una tarjeta sola si hay más
 * de una, que es lo que haría un reparto que llena de `max` en `max`.
 */
export function cardRows(n: number, max = 4): number[] {
  if (n <= 0) return [];
  const rows = Math.ceil(n / max);
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Trocea `items` según `cardRows`. */
export function chunkRows<T>(items: T[], max = 4): T[][] {
  const out: T[][] = [];
  let at = 0;
  for (const size of cardRows(items.length, max)) {
    out.push(items.slice(at, at + size));
    at += size;
  }
  return out;
}

/** Los `n` tramos más recientes, el último primero. */
export function recentSegments(
  segments: ActivitySegment[],
  n = 6,
): ActivitySegment[] {
  return [...segments]
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, n);
}

/** El último tramo en `waiting` (cuándo y cuánto te esperó), o `null`. */
export function lastWaiting(
  segments: ActivitySegment[],
): ActivitySegment | null {
  return (
    recentSegments(segments, segments.length).find(
      (s) => s.group === "waiting",
    ) ?? null
  );
}

const ORIGIN_COLORS: Record<string, string> = {
  claude_code: "var(--src-code)",
  chat: "var(--src-chat)",
  cowork: "var(--src-cowork)",
};

/** Color de un origen del reparto semanal; uno desconocido cae en "otros". */
export function originColor(key: string): string {
  return ORIGIN_COLORS[key] ?? "var(--src-other)";
}

export const GROUP_COLOR: Record<ActivityGroup, string> = {
  working: "var(--act-work)",
  thinking: "var(--act-explore)",
  waiting: "var(--act-wait)",
  resting: "var(--act-idle)",
};
