import type {
  ActivityGroup,
  ActivityResponse,
  ActivitySegment,
  ActivitySession,
  PetState,
} from "@amnis/shared";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Mismo agrupado que `groupOf` del daemon (`domain/activity.ts`). */
const GROUPS: Partial<Record<PetState, ActivityGroup>> = {
  coding: "working",
  testing: "working",
  terminal: "working",
  subagents: "working",
  committing: "working",
  pushing: "working",
  researching: "thinking",
  planning: "thinking",
  waiting: "waiting",
};

export function groupOf(state: PetState): ActivityGroup {
  return GROUPS[state] ?? "resting";
}

export const GROUP_LABEL: Record<ActivityGroup, string> = {
  working: "Trabajando",
  thinking: "Investigando o planificando",
  waiting: "Esperándote",
  resting: "Descansando",
};

/** `YYYY-MM-DD` en hora local: el daemon interpreta `day` así, no en UTC. */
export function dayKey(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function yesterday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}

export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")} min`;
}

export interface StateRow {
  state: PetState;
  minutes: number;
}

/**
 * Filas de "tiempo por estado": minutos **enteros** y sin los estados de
 * descanso. El titular suma estas mismas filas, así que lista y titular no
 * pueden discrepar por redondeo.
 */
export function stateRows(byState: ActivityResponse["byState"]): StateRow[] {
  const rows: StateRow[] = [];
  for (const [state, value] of Object.entries(byState)) {
    if (groupOf(state as PetState) === "resting") continue;
    const minutes = Math.round(value ?? 0);
    if (minutes > 0) rows.push({ state: state as PetState, minutes });
  }
  return rows.sort((a, b) => b.minutes - a.minutes);
}

export function activeMinutes(rows: readonly StateRow[]): number {
  return rows.reduce((sum, r) => sum + r.minutes, 0);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function headline(
  resp: ActivityResponse,
  rows: readonly StateRow[],
  isToday: boolean,
): { title: string; detail: string } {
  const when = isToday ? "Hoy" : "Ayer";
  if (resp.sessions.length === 0) {
    return {
      title: `${when}, sin actividad de agentes`,
      detail: "No llegó ningún evento de hook ese día.",
    };
  }
  const projects = new Set(resp.sessions.map((s) => s.project ?? s.sessionId));
  const sessions = `${plural(resp.sessions.length, "sesión", "sesiones")} en ${plural(projects.size, "proyecto", "proyectos")}.`;
  const { minutes, count } = resp.waiting;
  const waited =
    count > 0
      ? ` Amnis te esperó ${formatMinutes(minutes)} en ${plural(count, "permiso", "permisos")}.`
      : " Amnis no tuvo que esperarte.";
  return {
    title: `${when}, ${formatMinutes(activeMinutes(rows))} con agentes trabajando`,
    detail: sessions + waited,
  };
}

/** Eje de la línea del día: 08:00–20:00, ampliado a horas enteras si hace falta. */
export function timelineRange(
  segments: readonly ActivitySegment[],
  dayStart: Date,
): { from: number; to: number } {
  const base = dayStart.getTime();
  let fromH = 8;
  let toH = 20;
  for (const s of segments) {
    const start = (Date.parse(s.start) - base) / HOUR_MS;
    const end = (Date.parse(s.end) - base) / HOUR_MS;
    fromH = Math.min(fromH, Math.floor(start));
    toH = Math.max(toH, Math.ceil(end));
  }
  return {
    from: base + Math.max(0, fromH) * HOUR_MS,
    to: base + Math.min(24, toH) * HOUR_MS,
  };
}

/** 0–4 sobre la rampa `--heat-0…4`; 0 solo si no hay minutos. */
export function heatLevel(minutes: number, max: number): number {
  if (minutes <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((minutes / max) * 4)));
}

/** Una sesión sigue viva si su último tramo llega a "ahora". */
export function isOngoing(
  session: ActivitySession,
  fetchedAt: number,
): boolean {
  return fetchedAt - Date.parse(session.end) < MINUTE_MS;
}
