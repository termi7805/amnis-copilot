import type { QuotaSnapshot } from "@amnis/shared";
import { describe, expect, it } from "vitest";
import {
  fiveHourExhaustion,
  fiveHourWindow,
  paceHeadline,
  paceLevel,
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
    projection: { fiveHourAtReset: 62, fiveHourExhaustsAt: null },
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

/** `now` al `pct` % de la ventana. */
const at = (pct: number) => new Date(START.getTime() + (pct / 100) * 5 * HOUR);

describe("paceLevel", () => {
  const level = (used: number, pct: number) =>
    paceLevel(fiveHourWindow(withSession("normal", used), at(pct)));

  it("clasifica agotada, no llegas, justo, margen y recién empezada", () => {
    expect(level(100, 90)).toBe("exhausted");
    expect(level(29, 16)).toBe("over");
    expect(level(50, 55)).toBe("tight");
    expect(level(34, 55)).toBe("margin");
    expect(level(1, 2)).toBe("starting");
  });
});

describe("severityPill", () => {
  const pill = (severity: string, used: number, pct: number) =>
    severityPill(
      withSession(severity, used),
      fiveHourWindow(withSession(severity, used), at(pct)),
    );

  it("normal con margen: ritmo sostenible; critical manda", () => {
    expect(pill("normal", 34, 55)).toEqual({
      tone: "ok",
      label: "Ritmo sostenible",
    });
    expect(pill("critical", 34, 55).tone).toBe("crit");
  });

  it("29 % con el 16 % de la ventana y severity normal: no es sostenible", () => {
    const q = withSession("normal", 29);
    const w = fiveHourWindow(q, at(16));
    const p = severityPill(q, w);
    expect(p.label).not.toBe("Ritmo sostenible");
    expect(p.tone).toBe("crit");
    expect(paceHeadline(w, 187).title).toBe("A este ritmo no llegas al reset");
  });

  it("severity critical con ritmo bajo sigue en crítico", () => {
    expect(pill("critical", 10, 55)).toEqual({
      tone: "crit",
      label: "Al límite",
    });
  });

  it("el ritmo justo es warn; warning con ritmo bajo es warn", () => {
    expect(pill("normal", 50, 55)).toEqual({
      tone: "warn",
      label: "Vas justo",
    });
    expect(pill("warning", 10, 55)).toEqual({
      tone: "warn",
      label: "Ritmo alto",
    });
  });

  it("warning con ritmo insostenible: manda el ritmo", () => {
    expect(pill("warning", 29, 16)).toEqual({
      tone: "crit",
      label: "Ritmo insostenible",
    });
  });

  it("agotada", () => {
    expect(pill("normal", 100, 90)).toEqual({ tone: "crit", label: "Agotada" });
  });

  it("recién empezada: la severity tal cual", () => {
    expect(pill("normal", 1, 2)).toEqual({
      tone: "ok",
      label: "Ritmo sostenible",
    });
    expect(pill("critical", 1, 2).label).toBe("Al límite");
  });

  it("una severidad desconocida se muestra tal cual", () => {
    expect(pill("nueva", 34, 55)).toEqual({ tone: "neutral", label: "nueva" });
  });

  it("sin endpoint: estimado", () => {
    const q = quota({ authoritative: null });
    expect(severityPill(q, fiveHourWindow(q, NOW)).label).toBe("estimado");
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

describe("fiveHourExhaustion", () => {
  const at = new Date(NOW.getTime() + 1.5 * HOUR);
  const con = (
    over: Partial<QuotaSnapshot["projection"]>,
    q: Partial<QuotaSnapshot> = {},
  ) => {
    const quota_ = quota({
      projection: {
        fiveHourAtReset: 120,
        fiveHourExhaustsAt: at.toISOString(),
        ...over,
      },
      ...q,
    });
    return fiveHourExhaustion(quota_, fiveHourWindow(quota_, NOW));
  };

  it("se agota antes del reset: la hora", () => {
    expect(con({})).toEqual({ kind: "at", at });
  });

  it("la hora cae después del reset: te llega al reset", () => {
    const tarde = new Date(END.getTime() + HOUR).toISOString();
    expect(con({ fiveHourExhaustsAt: tarde })).toEqual({ kind: "lasts" });
  });

  it("ritmo 0 (proyección sin hora): te llega al reset", () => {
    expect(con({ fiveHourAtReset: 34, fiveHourExhaustsAt: null })).toEqual({
      kind: "lasts",
    });
  });

  it("sin proyección: pocas muestras", () => {
    expect(con({ fiveHourAtReset: null, fiveHourExhaustsAt: null })).toEqual({
      kind: "unknown",
    });
  });

  it("uso ≥ 100 %: agotada, aunque haya hora", () => {
    const q = withSession("high", 100);
    q.projection = {
      fiveHourAtReset: 200,
      fiveHourExhaustsAt: at.toISOString(),
    };
    expect(fiveHourExhaustion(q, fiveHourWindow(q, NOW))).toEqual({
      kind: "exhausted",
    });
  });

  it("sin endpoint: oculto", () => {
    expect(con({}, { authoritative: null })).toEqual({ kind: "hidden" });
  });
});
