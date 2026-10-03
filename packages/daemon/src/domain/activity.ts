import type { ActivityGroup, PetState } from "@amnis/shared";

/** Lo mínimo de un `hook_events` que hace falta para armar tramos. */
export interface ActivityEvent {
  sessionId: string | null;
  ts: string;
  /** Un `PetState`, o `"unknown"` si el hook no mapeó a ningún estado. */
  derivedState: string;
}

/** Tramo de una sesión en un estado, en ms desde epoch. */
export interface Segment {
  sessionId: string;
  state: PetState;
  start: number;
  end: number;
}

const GROUPS: Partial<Record<string, ActivityGroup>> = {
  coding: "working",
  testing: "working",
  terminal: "working",
  subagents: "working",
  committing: "working",
  pushing: "working",
  researching: "thinking",
  planning: "thinking",
  waiting: "waiting",
  resting: "resting",
  limited: "resting",
};

export function groupOf(state: PetState): ActivityGroup {
  return GROUPS[state] ?? "resting";
}

const MINUTE_MS = 60_000;

interface Open {
  state: PetState;
  start: number;
  lastAt: number;
}

/**
 * Tramos por sesión a partir de los eventos de hook. Se calculan **por
 * sesión**, nunca sobre la línea global: dos terminales a la vez se solapan.
 *
 * Un tramo dura hasta el siguiente evento de su sesión, con tope en
 * `sleepTimeoutMs` desde el último evento suyo (y en `now`): si no, una sesión
 * abandonada a mediodía saldría "trabajando" hasta medianoche. Pasado el
 * tope queda un hueco (`sleeping` no es un tramo).
 *
 * Los eventos sin estado (`unknown`: Skill, ToolSearch, MCP…) prueban que la
 * sesión sigue viva, así que alargan un tramo de trabajo; pero si llegan
 * dentro de `waiting` o `resting` lo cierran, porque una herramienta nueva
 * significa que ya respondiste. Sin ello "te esperó" contaría su tiempo.
 * No hay `PostToolUse`, así que un `waiting` dura hasta el siguiente
 * `PreToolUse` e incluye lo que tarda en ejecutarse lo que aceptaste.
 *
 * Los eventos sin `sessionId` no se pueden atribuir a ninguna sesión y se
 * descartan.
 */
export function segmentsFromEvents(
  events: readonly ActivityEvent[],
  sleepTimeoutMs: number,
  now: Date,
): Segment[] {
  const bySession = new Map<string, { at: number; state: string }[]>();
  for (const e of events) {
    if (!e.sessionId) continue;
    const at = Date.parse(e.ts);
    if (Number.isNaN(at)) continue;
    const list = bySession.get(e.sessionId) ?? [];
    list.push({ at, state: e.derivedState });
    bySession.set(e.sessionId, list);
  }

  const segments: Segment[] = [];
  for (const [sessionId, list] of bySession) {
    list.sort((a, b) => a.at - b.at);
    let open: Open | null = null;

    const close = (until: number) => {
      if (!open) return;
      const end = Math.min(until, open.lastAt + sleepTimeoutMs, now.getTime());
      if (end > open.start) {
        segments.push({
          sessionId,
          state: open.state,
          start: open.start,
          end,
        });
      }
      open = null;
    };

    for (const { at, state } of list) {
      const alive: boolean =
        open !== null && at - open.lastAt <= sleepTimeoutMs;
      if (state === "unknown") {
        const group = open ? groupOf(open.state) : null;
        if (open && alive && group !== "waiting" && group !== "resting") {
          open.lastAt = at;
        } else {
          close(at);
        }
        continue;
      }
      if (open && alive && open.state === state) {
        open.lastAt = at;
        continue;
      }
      close(at);
      open = { state: state as PetState, start: at, lastAt: at };
    }
    close(Number.POSITIVE_INFINITY);
  }

  return segments.sort((a, b) => a.start - b.start);
}

/** Recorta los tramos a `[from, to)`; los que quedan vacíos se descartan. */
export function clipSegments(
  segments: readonly Segment[],
  from: number,
  to: number,
): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const start = Math.max(s.start, from);
    const end = Math.min(s.end, to);
    if (end > start) out.push({ ...s, start, end });
  }
  return out;
}

/** Minutos por estado. Su suma es exactamente la de las duraciones. */
export function minutesByState(
  segments: readonly Segment[],
): Partial<Record<PetState, number>> {
  const out: Partial<Record<PetState, number>> = {};
  for (const s of segments) {
    out[s.state] = (out[s.state] ?? 0) + (s.end - s.start) / MINUTE_MS;
  }
  return out;
}

/** Cada tramo `waiting` es un aviso: cuánto te esperó y en cuántos. */
export function waitingSummary(segments: readonly Segment[]): {
  minutes: number;
  count: number;
} {
  const waiting = segments.filter((s) => s.state === "waiting");
  return {
    minutes: waiting.reduce((sum, s) => sum + (s.end - s.start) / MINUTE_MS, 0),
    count: waiting.length,
  };
}

/**
 * Matriz 7×24 (0 = lunes) de minutos de agente en hora local, sin contar
 * `resting`. Dos sesiones a la vez suman las dos: una celda puede pasar de 60.
 */
export function heatmap(segments: readonly Segment[]): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const s of segments) {
    if (groupOf(s.state) === "resting") continue;
    let cursor = s.start;
    while (cursor < s.end) {
      const d = new Date(cursor);
      const nextHour = new Date(cursor);
      nextHour.setMinutes(0, 0, 0);
      nextHour.setHours(nextHour.getHours() + 1);
      const until = Math.min(s.end, nextHour.getTime());
      const row = grid[(d.getDay() + 6) % 7];
      if (row)
        row[d.getHours()] =
          (row[d.getHours()] ?? 0) + (until - cursor) / MINUTE_MS;
      cursor = until;
    }
  }
  return grid;
}
