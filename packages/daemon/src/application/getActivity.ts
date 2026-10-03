import type {
  ActivityHeatmapResponse,
  ActivityResponse,
  ActivitySession,
} from "@amnis/shared";
import {
  type ActivityEvent,
  clipSegments,
  groupOf,
  heatmap,
  minutesByState,
  type Segment,
  segmentsFromEvents,
  waitingSummary,
} from "../domain/activity.ts";
import { SLEEP_AFTER_MS } from "../domain/petState.ts";
import { projectName } from "./getState.ts";

export interface ActivityDeps {
  eventsBetween(
    from: Date,
    to: Date,
  ): (ActivityEvent & { project: string | null })[];
  /** Tokens y coste (equivalente de API) por `session_id` en el rango. */
  usageBySession(
    from: Date,
    to: Date,
  ): Map<string, { tokens: number; costUsd: number }>;
  branchBySession(from: Date, to: Date): Map<string, string>;
}

const MINUTE_MS = 60_000;

/**
 * `YYYY-MM-DD` → medianoche local de ese día, o `null` si no es una fecha
 * real (`2026-02-30`). Se construye con componentes, no con `Date.parse`, que
 * lee la cadena como UTC y movería el día.
 */
export function parseDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  const ok =
    date.getFullYear() === y &&
    date.getMonth() === mo - 1 &&
    date.getDate() === d;
  return ok ? date : null;
}

/** Medianoche local de `date`. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatDay(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/**
 * Tramos de `[from, to)`. Se leen eventos desde `SLEEP_AFTER_MS` antes: un
 * tramo que empezó a las 23:58 sigue vivo a las 00:00 y hay que verlo.
 */
function segmentsIn(
  deps: ActivityDeps,
  from: Date,
  to: Date,
  now: Date,
): { segments: Segment[]; projects: Map<string, string> } {
  const events = deps.eventsBetween(
    new Date(from.getTime() - SLEEP_AFTER_MS),
    to,
  );
  const projects = new Map<string, string>();
  for (const e of events) {
    if (e.sessionId && e.project) projects.set(e.sessionId, e.project);
  }
  const all = segmentsFromEvents(events, SLEEP_AFTER_MS, now);
  return {
    segments: clipSegments(all, from.getTime(), to.getTime()),
    projects,
  };
}

/**
 * Qué hicieron los agentes un día (hora local del daemon): tramos por sesión,
 * tiempo por estado y cuánto te esperaron. Solo metadatos (DESIGN §3).
 */
export function getActivity(
  deps: ActivityDeps,
  dayStart: Date,
  now: Date,
): ActivityResponse {
  const dayEnd = new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate() + 1,
  );
  const { segments, projects } = segmentsIn(deps, dayStart, dayEnd, now);
  const usage = deps.usageBySession(dayStart, dayEnd);
  const branches = deps.branchBySession(dayStart, dayEnd);

  const sessions = new Map<string, ActivitySession>();
  for (const s of segments) {
    const active = groupOf(s.state) === "resting" ? 0 : s.end - s.start;
    const known = sessions.get(s.sessionId);
    if (known) {
      // Los tramos vienen ordenados por inicio: `start` ya es el primero.
      if (s.end > Date.parse(known.end)) {
        known.end = new Date(s.end).toISOString();
      }
      known.activeMinutes += active / MINUTE_MS;
      continue;
    }
    const cwd = projects.get(s.sessionId) ?? null;
    const used = usage.get(s.sessionId);
    sessions.set(s.sessionId, {
      sessionId: s.sessionId,
      project: projectName(cwd),
      gitBranch: branches.get(s.sessionId) ?? null,
      start: new Date(s.start).toISOString(),
      end: new Date(s.end).toISOString(),
      activeMinutes: active / MINUTE_MS,
      tokens: used?.tokens ?? 0,
      costUsd: used?.costUsd ?? 0,
    });
  }

  return {
    day: formatDay(dayStart),
    sessions: [...sessions.values()].sort((a, b) =>
      a.start.localeCompare(b.start),
    ),
    segments: segments.map((s) => ({
      sessionId: s.sessionId,
      state: s.state,
      group: groupOf(s.state),
      start: new Date(s.start).toISOString(),
      end: new Date(s.end).toISOString(),
    })),
    byState: minutesByState(segments),
    waiting: waitingSummary(segments),
  };
}

/** Minutos de agente por hora y día de la semana en las últimas `weeks`. */
export function getHeatmap(
  deps: ActivityDeps,
  weeks: number,
  now: Date,
): ActivityHeatmapResponse {
  const from = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (7 * weeks - 1),
  );
  const { segments } = segmentsIn(deps, from, now, now);
  return {
    weeks,
    from: from.toISOString(),
    to: now.toISOString(),
    minutes: heatmap(segments),
  };
}
