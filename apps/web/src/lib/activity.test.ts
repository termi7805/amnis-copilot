import type { ActivityResponse, ActivitySegment } from "@amnis/shared";
import { describe, expect, it } from "vitest";
import {
  activeMinutes,
  dayKey,
  formatMinutes,
  headline,
  heatLevel,
  isOngoing,
  stateRows,
  timelineRange,
} from "./activity.ts";

function response(extra: Partial<ActivityResponse> = {}): ActivityResponse {
  return {
    day: "2026-10-03",
    sessions: [],
    segments: [],
    byState: {},
    waiting: { minutes: 0, count: 0 },
    ...extra,
  };
}

function seg(start: string, end: string): ActivitySegment {
  return {
    sessionId: "a",
    state: "coding",
    group: "working",
    start,
    end,
  };
}

describe("stateRows", () => {
  it("redondea a minutos enteros y la suma es la del titular", () => {
    const rows = stateRows({ coding: 10.4, waiting: 3.4, researching: 4.4 });
    expect(rows.map((r) => r.minutes)).toEqual([10, 4, 3]);
    expect(activeMinutes(rows)).toBe(17);
  });

  it("deja fuera resting, limited, sleeping y los ceros", () => {
    const rows = stateRows({
      coding: 5,
      resting: 90,
      limited: 20,
      sleeping: 3,
      testing: 0.2,
    });
    expect(rows).toEqual([{ state: "coding", minutes: 5 }]);
  });

  it("ordena de más a menos", () => {
    expect(stateRows({ planning: 2, coding: 9 }).map((r) => r.state)).toEqual([
      "coding",
      "planning",
    ]);
  });
});

describe("formatMinutes", () => {
  it("usa minutos por debajo de una hora y horas con minutos a partir de ella", () => {
    expect(formatMinutes(14)).toBe("14 min");
    expect(formatMinutes(312)).toBe("5 h 12 min");
    expect(formatMinutes(125)).toBe("2 h 05 min");
    expect(formatMinutes(120)).toBe("2 h");
  });
});

describe("headline", () => {
  it("cuenta sesiones, proyectos y la espera", () => {
    const resp = response({
      sessions: [
        { sessionId: "1", project: "a" },
        { sessionId: "2", project: "a" },
        { sessionId: "3", project: "b" },
      ] as ActivityResponse["sessions"],
      waiting: { minutes: 14, count: 3 },
    });
    const rows = stateRows({ coding: 312 });
    const h = headline(resp, rows, true);
    expect(h.title).toBe("Hoy, 5 h 12 min con agentes trabajando");
    expect(h.detail).toBe(
      "3 sesiones en 2 proyectos. Amnis te esperó 14 min en 3 permisos.",
    );
  });

  it("un día sin sesiones lo dice", () => {
    expect(headline(response(), [], false).title).toBe(
      "Ayer, sin actividad de agentes",
    );
  });
});

describe("timelineRange", () => {
  const day = new Date(2026, 9, 3);
  const at = (h: number, m = 0) => new Date(2026, 9, 3, h, m).toISOString();

  it("por defecto 08:00–20:00", () => {
    const { from, to } = timelineRange([seg(at(9), at(10))], day);
    expect(new Date(from).getHours()).toBe(8);
    expect(new Date(to).getHours()).toBe(20);
  });

  it("se amplía a horas enteras si hay actividad fuera", () => {
    const { from, to } = timelineRange(
      [seg(at(6, 30), at(7)), seg(at(21), at(22, 15))],
      day,
    );
    expect(new Date(from).getHours()).toBe(6);
    expect(new Date(to).getHours()).toBe(23);
  });
});

describe("heatLevel", () => {
  it("0 solo sin minutos; cualquier actividad es al menos 1", () => {
    expect(heatLevel(0, 100)).toBe(0);
    expect(heatLevel(1, 100)).toBe(1);
    expect(heatLevel(100, 100)).toBe(4);
    expect(heatLevel(50, 100)).toBe(2);
    expect(heatLevel(5, 0)).toBe(0);
  });
});

describe("isOngoing", () => {
  const s = {
    end: "2026-10-03T10:00:00.000Z",
  } as ActivityResponse["sessions"][0];
  it("viva si su último tramo llega a ahora", () => {
    expect(isOngoing(s, Date.parse("2026-10-03T10:00:30.000Z"))).toBe(true);
    expect(isOngoing(s, Date.parse("2026-10-03T10:05:00.000Z"))).toBe(false);
  });
});

describe("dayKey", () => {
  it("usa el día local, no el UTC", () => {
    expect(dayKey(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
    expect(dayKey(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});
