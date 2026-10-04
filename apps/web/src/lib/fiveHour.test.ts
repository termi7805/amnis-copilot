import type { QuotaSnapshot } from "@amnis/shared";
import { describe, expect, it } from "vitest";
import {
  fiveHourWindow,
  paceHeadline,
  severityPill,
  sparkPoints,
} from "./fiveHour.ts";

const HOUR = 60 * 60_000;
// Ventana 13:00-18:00; "ahora" son las 15:45 (55 % del tiempo).
const START = new Date("2026-01-01T13:00:00Z");
const END = new Date("2026-01-01T18:00:00Z");
const NOW = new Date(START.getTime() + 2.75 * HOUR);

/** Un snapshot con endpoint cuyo límite de sesión tiene esa `severity` y `%`. */
function withSession(severity: string, utilization = 34): QuotaSnapshot {
  const q = quota();
  const auth = q.authoritative;
  if (!auth) throw new Error("fixture sin endpoint");
  auth.fiveHour.utilization = utilization;
  const [limit] = auth.limits;
  if (limit) limit.severity = severity;
  return q;
}

function quota(over: Partial<QuotaSnapshot> = {}): QuotaSnapshot {
  return {
    provider: "anthropic",
    authoritative: {
      fiveHour: { utilization: 34, resetsAt: END.toISOString() },
      sevenDay: { utilization: 41, resetsAt: null },
      limits: [
        {
          kind: "session",
          group: "session",
          scope: null,
          utilization: 34,
          resetsAt: END.toISOString(),
          severity: "normal",
          isActive: true,
          label: "5h",
        },
      ],
      weeklyBreakdown: null,
    },
    local: {
      fiveHourTokens: 41200,
      fiveHourUtilization: 28,
      windowStartedAt: START.toISOString(),
      calibrated: true,
      ceilingWindows: 3,
      provisionalUtilization: null,
    },
    divergence: 6,
    projection: { fiveHourAtReset: 62 },
    sampledAt: NOW.toISOString(),
    error: null,
    rateLimitedAt: null,
    ...over,
  };
}

describe("fiveHourWindow", () => {
  it("con endpoint: la ventana arranca en resets_at − 5 h", () => {
    const w = fiveHourWindow(quota(), NOW);
    expect(w.start).toEqual(START);
    expect(w.end).toEqual(END);
    expect(w.elapsedPct).toBeCloseTo(55);
    expect(w.used).toBe(34);
    expect(w.estimated).toBe(false);
  });

  it("sin endpoint: usa la estimación local y se marca como estimada", () => {
    const w = fiveHourWindow(quota({ authoritative: null }), NOW);
    expect(w.estimated).toBe(true);
    expect(w.used).toBe(28);
    expect(w.start).toEqual(START);
  });

  it("el tiempo transcurrido se recorta a 0-100", () => {
    const late = new Date(END.getTime() + HOUR);
    expect(fiveHourWindow(quota(), late).elapsedPct).toBe(100);
  });
});

describe("paceHeadline", () => {
  it("34 % con el 55 % del tiempo: margen, y la proyección en el detalle", () => {
    const h = paceHeadline(fiveHourWindow(quota(), NOW), 62);
    expect(h.title).toBe("Te queda margen para esta ventana");
    expect(h.detail).toContain("62 %");
  });

  it("el mismo uso con el 10 % del tiempo es otra situación", () => {
    const early = new Date(START.getTime() + 0.5 * HOUR);
    const h = paceHeadline(fiveHourWindow(quota(), early), null);
    expect(h.title).toBe("A este ritmo no llegas al reset");
  });

  it("entre el 85 % y el 100 % del ritmo lineal: justo", () => {
    const q = withSession("normal", 50);
    expect(paceHeadline(fiveHourWindow(q, NOW), null).title).toBe(
      "Vas justo para esta ventana",
    );
  });

  it("estimado: dice que lo es y no habla de proyección", () => {
    const h = paceHeadline(
      fiveHourWindow(quota({ authoritative: null }), NOW),
      62,
    );
    expect(h.detail).toContain("~28 %");
    expect(h.detail).toContain("estimación local");
    expect(h.detail).not.toContain("62");
  });

  it("sin endpoint y sin calibrar: no hay % que enseñar ni ritmo que juzgar", () => {
    const q = quota({
      authoritative: null,
      local: {
        fiveHourTokens: 3_119_012,
        fiveHourUtilization: 7089,
        windowStartedAt: START.toISOString(),
        calibrated: false,
        ceilingWindows: 0,
        provisionalUtilization: null,
      },
    });
    const w = fiveHourWindow(q, NOW);
    expect(w.known).toBe(false);
    const h = paceHeadline(w, null);
    expect(h.title).toBe("Sin dato fiable de esta ventana");
    expect(`${h.title} ${h.detail}`).not.toMatch(/\d+ %/);
  });

  it("con endpoint, sin calibrar sigue habiendo dato", () => {
    const q = quota({
      local: {
        fiveHourTokens: 3_119_012,
        fiveHourUtilization: 7089,
        windowStartedAt: START.toISOString(),
        calibrated: false,
        ceilingWindows: 0,
        provisionalUtilization: null,
      },
    });
    expect(fiveHourWindow(q, NOW).known).toBe(true);
  });
});

describe("estimación provisional (#117)", () => {
  const provisional = (over: Partial<QuotaSnapshot["local"]> = {}) =>
    quota({
      authoritative: null,
      local: {
        fiveHourTokens: 9_930_000,
        fiveHourUtilization: 7089,
        windowStartedAt: START.toISOString(),
        calibrated: false,
        ceilingWindows: 1,
        provisionalUtilization: 11.2,
        ...over,
      },
    });

  it("sin endpoint y con 1-2 ventanas: dato conocido, provisional n/3", () => {
    const w = fiveHourWindow(provisional(), NOW);
    expect(w.known).toBe(true);
    expect(w.estimated).toBe(true);
    expect(w.used).toBe(11.2);
    expect(w.provisional).toEqual({ windows: 1 });
    expect(paceHeadline(w, null).detail).toContain(
      "provisional (1/3 ventanas)",
    );
  });

  it("con 0 ventanas sigue sin dato", () => {
    const w = fiveHourWindow(
      provisional({ ceilingWindows: 0, provisionalUtilization: null }),
      NOW,
    );
    expect(w.known).toBe(false);
    expect(w.provisional).toBeNull();
  });

  it("con endpoint manda el endpoint y no hay provisional", () => {
    const q = quota({
      local: {
        ...quota().local,
        calibrated: false,
        provisionalUtilization: 11,
      },
    });
    const w = fiveHourWindow(q, NOW);
    expect(w.used).toBe(34);
    expect(w.provisional).toBeNull();
  });
});

describe("severityPill", () => {
  it("sale de la severity del límite de sesión", () => {
    expect(severityPill(quota())).toEqual({
      tone: "ok",
      label: "Ritmo sostenible",
    });
    expect(severityPill(withSession("critical")).tone).toBe("crit");
  });

  it("una severidad desconocida se muestra tal cual", () => {
    expect(severityPill(withSession("nueva"))).toEqual({
      tone: "neutral",
      label: "nueva",
    });
  });

  it("sin endpoint: estimado", () => {
    expect(severityPill(quota({ authoritative: null })).label).toBe("estimado");
  });
});

describe("sparkPoints", () => {
  const samples = [
    { at: "2026-01-01T12:00:00Z", fiveHour: 90, sevenDay: 1, local: 80 },
    { at: "2026-01-01T13:00:00Z", fiveHour: 0, sevenDay: 1, local: 0 },
    { at: "2026-01-01T14:00:00Z", fiveHour: null, sevenDay: null, local: 5 },
    { at: "2026-01-01T15:30:00Z", fiveHour: 30, sevenDay: 1, local: 20 },
  ];

  it("solo la ventana actual, saltando las muestras sin endpoint", () => {
    const pts = sparkPoints(samples, fiveHourWindow(quota(), NOW));
    expect(pts).toHaveLength(2);
    expect(pts[0]?.[0]).toBe(0);
    expect(pts[1]?.[0]).toBeCloseTo(300);
  });

  it("sin endpoint dibuja la serie local", () => {
    const w = fiveHourWindow(quota({ authoritative: null }), NOW);
    expect(sparkPoints(samples, w)).toHaveLength(3);
  });
});
