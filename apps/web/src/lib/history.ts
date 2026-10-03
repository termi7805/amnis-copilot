import type { PlanInfo, QuotaPeak } from "@amnis/shared";
import type { UsageAggregateRow } from "../api/usage.ts";

export type Range = 7 | 30 | 90 | "all";
export const RANGES: { id: Range; label: string }[] = [
  { id: 7, label: "7 d" },
  { id: 30, label: "30 d" },
  { id: 90, label: "90 d" },
  { id: "all", label: "Todo" },
];

const DAY_MS = 24 * 60 * 60_000;

/** Inicio del rango; `undefined` en "todo" (sin `from`). Es un inicio de día
 * UTC, como el `date(ts)` de SQLite, para que el primer día salga entero. */
export function rangeFrom(range: Range, now: Date): Date | undefined {
  if (range === "all") return undefined;
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return new Date(today - (range - 1) * DAY_MS);
}

/** Días que abarca el rango, para prorratear el precio del plan. En "todo",
 * desde el primer día con datos (mínimo 1). */
export function rangeDays(
  range: Range,
  firstDay: string | undefined,
  now: Date,
): number {
  if (range !== "all") return range;
  if (!firstDay) return 1;
  const first = Date.parse(`${firstDay}T00:00:00Z`);
  return Math.max(1, Math.ceil((now.getTime() - first) / DAY_MS));
}

/** Precio del plan en el rango: 30 d → 1×, 7 d → 7/30. */
export function planShare(plan: PlanInfo, days: number): number {
  return (plan.monthlyUsd * days) / 30;
}

export interface Headline {
  title: string;
  detail: string;
  /** `null` sin plan: nunca se supone uno. */
  multiplier: number | null;
}

export function formatUsd(value: number): string {
  return `$${value.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} k`;
  }
  return String(value);
}

function rangeText(range: Range, days: number): string {
  return range === "all"
    ? `en todo el histórico (${days} días)`
    : `en los últimos ${range} días`;
}

export function headline(
  totalCost: number,
  plan: PlanInfo | null,
  range: Range,
  days: number,
): Headline {
  if (!plan) {
    return {
      title: `Equivalente de API ${rangeText(range, days).replace("en los últimos ", "en ")}: ${formatUsd(totalCost)}`,
      detail:
        "No se detecta tu plan: elígelo en Ajustes para comparar con lo que pagas.",
      multiplier: null,
    };
  }
  const share = planShare(plan, days);
  const multiplier = share > 0 ? totalCost / share : null;
  const prorated = days !== 30;
  const planText = prorated
    ? `Plan ${plan.label}: ${formatUsd(plan.monthlyUsd)} al mes, ${formatUsd(share)} prorrateado a ${days} días.`
    : `Plan ${plan.label}: ${formatUsd(plan.monthlyUsd)} al mes.`;
  return {
    title:
      multiplier === null
        ? "Todavía no hay consumo con el que comparar"
        : `Tu suscripción rinde ${multiplier.toLocaleString("es-ES", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} veces su precio`,
    detail: `${capitalize(rangeText(range, days))}, ese consumo habría costado ${formatUsd(totalCost)} pagando la API pública. ${planText}`,
    multiplier,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `claude-opus-5-5` → `Opus 5.5`; vacío → `(sin modelo)`. */
export function modelLabel(id: string): string {
  if (id === "") return "(sin modelo)";
  const match = /^claude-([a-z]+)-(\d+(?:-\d+)?)$/.exec(id);
  if (!match) return id;
  const [, family = "", version = ""] = match;
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${version.replace("-", ".")}`;
}

export function projectLabel(path: string): string {
  if (path === "") return "(sin proyecto)";
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

export const OTHER_MODELS = "Otros";

export interface CostDay {
  day: string;
  total: number;
  /** Coste por serie (modelo o "Otros"). */
  byModel: Record<string, number>;
}

export interface CostSeries {
  days: CostDay[];
  /** Modelos de mayor a menor coste; con más de 3, el resto va en "Otros". */
  models: string[];
}

export function totalCost(rows: UsageAggregateRow[]): number {
  return rows.reduce((sum, r) => sum + r.costUsd, 0);
}

/** Días rellenados con cero entre `from` y `to`, para que los huecos se vean. */
export function costSeries(
  rows: UsageAggregateRow[],
  from: Date | undefined,
  to: Date,
): CostSeries {
  const perModel = new Map<string, number>();
  for (const r of rows) {
    const m = r.model ?? "";
    perModel.set(m, (perModel.get(m) ?? 0) + r.costUsd);
  }
  const ranked = [...perModel.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([m]) => m);
  const top = ranked.slice(0, 3);
  const hasOthers = ranked.length > 3;
  const seriesOf = (m: string) => (top.includes(m) ? m : OTHER_MODELS);

  const byDay = new Map<string, CostDay>();
  for (const r of rows) {
    const day = byDay.get(r.key) ?? { day: r.key, total: 0, byModel: {} };
    const s = seriesOf(r.model ?? "");
    day.byModel[s] = (day.byModel[s] ?? 0) + r.costUsd;
    day.total += r.costUsd;
    byDay.set(r.key, day);
  }

  const first =
    from ??
    (rows.length ? new Date(`${[...byDay.keys()].sort()[0]}T00:00:00Z`) : to);
  const days: CostDay[] = [];
  for (
    let t = Date.UTC(
      first.getUTCFullYear(),
      first.getUTCMonth(),
      first.getUTCDate(),
    );
    t <= to.getTime();
    t += DAY_MS
  ) {
    const key = new Date(t).toISOString().slice(0, 10);
    days.push(byDay.get(key) ?? { day: key, total: 0, byModel: {} });
  }
  return { days, models: hasOthers ? [...top, OTHER_MODELS] : top };
}

export interface ModelTotal {
  model: string;
  tokens: number;
  costUsd: number;
}

export function rowTokens(r: UsageAggregateRow): number {
  return (
    r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens
  );
}

export function modelTotals(rows: UsageAggregateRow[]): ModelTotal[] {
  const map = new Map<string, ModelTotal>();
  for (const r of rows) {
    const m = r.model ?? "";
    const t = map.get(m) ?? { model: m, tokens: 0, costUsd: 0 };
    t.tokens += rowTokens(r);
    t.costUsd += r.costUsd;
    map.set(m, t);
  }
  return [...map.values()].sort((a, b) => b.costUsd - a.costUsd);
}

export interface TokenTypeTotals {
  cacheRead: number;
  cacheWrite: number;
  output: number;
  input: number;
  total: number;
}

export function tokenTypeTotals(rows: UsageAggregateRow[]): TokenTypeTotals {
  const t = { cacheRead: 0, cacheWrite: 0, output: 0, input: 0, total: 0 };
  for (const r of rows) {
    t.cacheRead += r.cacheReadTokens;
    t.cacheWrite += r.cacheCreationTokens;
    t.output += r.outputTokens;
    t.input += r.inputTokens;
  }
  t.total = t.cacheRead + t.cacheWrite + t.output + t.input;
  return t;
}

/** Días con tokens y racha actual (días seguidos hasta hoy; si hoy aún no hay
 * actividad, hasta ayer). */
export function activity(
  rows: UsageAggregateRow[],
  now: Date,
): { active: number; streak: number } {
  const days = new Set(rows.filter((r) => rowTokens(r) > 0).map((r) => r.key));
  let streak = 0;
  let t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (!days.has(new Date(t).toISOString().slice(0, 10))) t -= DAY_MS;
  while (days.has(new Date(t).toISOString().slice(0, 10))) {
    streak++;
    t -= DAY_MS;
  }
  return { active: days.size, streak };
}

export function limitDays(peaks: QuotaPeak[]): {
  count: number;
  last: string | null;
} {
  const hit = peaks
    .filter((p) => p.peak >= 100)
    .map((p) => p.day)
    .sort();
  return { count: hit.length, last: hit.at(-1) ?? null };
}
