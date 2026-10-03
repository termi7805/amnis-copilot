import type { ActivitySegment, QuotaLimit } from "@amnis/shared";
import { describe, expect, it } from "vitest";
import {
  cardRows,
  chunkRows,
  lastWaiting,
  modelLimits,
  originColor,
  recentSegments,
  scopeTitle,
  weeklyPace,
} from "./nowCards.ts";

const limit = (over: Partial<QuotaLimit>): QuotaLimit => ({
  kind: "weekly_all",
  group: "weekly",
  scope: null,
  utilization: 10,
  resetsAt: null,
  severity: "normal",
  isActive: true,
  label: "7d",
  ...over,
});

describe("modelLimits", () => {
  it("una cuenta con solo 5h y 7d no tiene límites de modelo", () => {
    expect(
      modelLimits([limit({ kind: "session", group: "session" }), limit({})]),
    ).toEqual([]);
  });

  it("recoge los semanales con scope, sea cual sea el modelo", () => {
    const fable = limit({ kind: "weekly_fable", scope: "fable" });
    const raro = limit({ kind: "weekly_x", scope: "modelo_nuevo" });
    expect(modelLimits([limit({}), fable, raro])).toEqual([fable, raro]);
  });

  it("ignora los que tienen scope pero no son semanales", () => {
    expect(modelLimits([limit({ group: "session", scope: "fable" })])).toEqual(
      [],
    );
  });
});

describe("scopeTitle", () => {
  it("pone la inicial en mayúscula y deja el resto", () => {
    expect(scopeTitle("fable")).toBe("Fable");
    expect(scopeTitle("modelo_nuevo")).toBe("Modelo_nuevo");
  });
});

describe("weeklyPace", () => {
  // La ventana va del 2026-01-01 00:00Z al 2026-01-08 00:00Z.
  const RESET = "2026-01-08T00:00:00Z";

  it("sin resetsAt no hay ritmo", () => {
    expect(weeklyPace(40, null, new Date())).toBeNull();
  });

  it("a mitad de semana con el 41 % va por debajo del lineal", () => {
    const pace = weeklyPace(41, RESET, new Date("2026-01-04T12:00:00Z"));
    expect(pace?.day).toBe(4);
    expect(pace?.elapsedPct).toBeCloseTo(50);
    expect(pace?.verdict).toBe("below");
  });

  it("cerca del lineal (±5 pts) es al ritmo; por encima, above", () => {
    const now = new Date("2026-01-04T12:00:00Z");
    expect(weeklyPace(53, RESET, now)?.verdict).toBe("on");
    expect(weeklyPace(60, RESET, now)?.verdict).toBe("above");
  });

  it("el día no pasa de 7 ni baja de 1", () => {
    expect(weeklyPace(0, RESET, new Date("2026-01-07T23:59:00Z"))?.day).toBe(7);
    expect(weeklyPace(0, RESET, new Date("2025-12-01T00:00:00Z"))?.day).toBe(1);
    expect(weeklyPace(0, RESET, new Date("2026-02-01T00:00:00Z"))?.day).toBe(7);
  });
});

describe("cardRows", () => {
  it("0 tarjetas → ninguna fila", () => {
    expect(cardRows(0)).toEqual([]);
  });

  it("3 y 4 caben en una fila", () => {
    expect(cardRows(3)).toEqual([3]);
    expect(cardRows(4)).toEqual([4]);
  });

  it("5 se reparte 3 + 2, no 4 + 1", () => {
    expect(cardRows(5)).toEqual([3, 2]);
    expect(cardRows(13)).toEqual([4, 3, 3, 3]);
  });

  it("de 2 a 13 tarjetas: suma n, ninguna fila supera 4 y ninguna queda sola", () => {
    for (let n = 2; n <= 13; n++) {
      const rows = cardRows(n);
      expect(rows.reduce((a, b) => a + b, 0)).toBe(n);
      expect(Math.max(...rows)).toBeLessThanOrEqual(4);
      expect(Math.min(...rows)).toBeGreaterThanOrEqual(2);
    }
  });

  it("chunkRows conserva el orden", () => {
    expect(chunkRows([1, 2, 3, 4, 5])).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });
});

const seg = (
  start: string,
  group: ActivitySegment["group"],
): ActivitySegment => ({
  sessionId: "s",
  state: group === "waiting" ? "waiting" : "coding",
  group,
  start,
  end: start,
});

describe("segmentos recientes", () => {
  const segs = [
    seg("2026-01-01T10:00:00Z", "working"),
    seg("2026-01-01T12:00:00Z", "waiting"),
    seg("2026-01-01T11:00:00Z", "waiting"),
    seg("2026-01-01T13:00:00Z", "resting"),
  ];

  it("recentSegments ordena del más reciente y recorta", () => {
    expect(recentSegments(segs, 2).map((s) => s.start)).toEqual([
      "2026-01-01T13:00:00Z",
      "2026-01-01T12:00:00Z",
    ]);
  });

  it("lastWaiting devuelve el último tramo de espera, no el último tramo", () => {
    expect(lastWaiting(segs)?.start).toBe("2026-01-01T12:00:00Z");
  });

  it("lastWaiting sin esperas es null", () => {
    expect(lastWaiting([seg("2026-01-01T10:00:00Z", "working")])).toBeNull();
  });
});

describe("originColor", () => {
  it("los conocidos tienen su token y el resto cae en otros", () => {
    expect(originColor("claude_code")).toBe("var(--src-code)");
    expect(originColor("origen_nuevo")).toBe("var(--src-other)");
  });
});
