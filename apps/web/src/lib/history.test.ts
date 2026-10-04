import type { PlanInfo } from "@amnis/shared";
import { describe, expect, it } from "vitest";
import type { UsageAggregateRow } from "../api/usage.ts";
import {
  activity,
  costSeries,
  headline,
  modelFamily,
  modelLabel,
  planShare,
  projectLabel,
  rangeDays,
  rangeFrom,
} from "./history.ts";

const PRO: PlanInfo = {
  id: "pro",
  label: "Pro",
  monthlyUsd: 20,
  source: "detected",
};

function row(key: string, model: string, costUsd: number): UsageAggregateRow {
  return {
    key,
    model,
    sessions: 1,
    inputTokens: 10,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    costUsd,
  };
}

describe("headline", () => {
  it("30 d compara con el precio entero y 7 d con 7/30", () => {
    expect(planShare(PRO, 30)).toBe(20);
    expect(planShare(PRO, 7)).toBeCloseTo(20 * (7 / 30));
    const h30 = headline(186, PRO, 30, 30);
    const h7 = headline(186, PRO, 7, 7);
    expect(h30.multiplier).toBeCloseTo(186 / 20);
    expect(h7.multiplier).toBeCloseTo(186 / (20 * (7 / 30)));
    expect(h7.detail).toContain("prorrateado a 7 días");
    expect(h30.detail).not.toContain("prorrateado");
  });

  it("sin plan no hay multiplicador ni plan supuesto", () => {
    const h = headline(186, null, 30, 30);
    expect(h.multiplier).toBeNull();
    expect(h.title).toBe("Equivalente de API en 30 días: $186,00");
    expect(h.title).not.toContain("veces");
  });
});

describe("rangos", () => {
  it("el rango de 7 d empieza hace 6 días UTC (7 días con hoy)", () => {
    const from = rangeFrom(7, new Date("2026-10-10T15:00:00Z"));
    expect(from?.toISOString()).toBe("2026-10-04T00:00:00.000Z");
    expect(rangeFrom("all", new Date())).toBeUndefined();
  });

  it("'todo' cuenta desde el primer día con datos", () => {
    expect(
      rangeDays("all", "2026-10-01", new Date("2026-10-11T00:00:00Z")),
    ).toBe(10);
    expect(rangeDays("all", undefined, new Date())).toBe(1);
    expect(rangeDays(90, "2026-10-01", new Date())).toBe(90);
  });
});

describe("costSeries", () => {
  it("rellena los días sin actividad y la suma de días == suma de filas", () => {
    const rows = [
      row("2026-10-01", "a", 3),
      row("2026-10-03", "a", 2),
      row("2026-10-03", "b", 1),
    ];
    const s = costSeries(
      rows,
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-10-04T10:00:00Z"),
    );
    expect(s.days.map((d) => d.day)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(s.days.reduce((t, d) => t + d.total, 0)).toBe(6);
    expect(s.models).toEqual(["a", "b"]);
  });

  it("agrupa en 'Otros' a partir del cuarto modelo sin perder coste", () => {
    const rows = ["m1", "m2", "m3", "m4", "m5"].map((m, i) =>
      row("2026-10-01", m, 10 - i),
    );
    const s = costSeries(rows, undefined, new Date("2026-10-01T10:00:00Z"));
    expect(s.models).toEqual(["m1", "m2", "m3", "Otros"]);
    expect(s.days[0]?.byModel.Otros).toBe(7 + 6);
    expect(s.days[0]?.total).toBe(10 + 9 + 8 + 7 + 6);
  });
});

describe("costSeries por familia", () => {
  it("las versiones de una familia suman en una sola serie", () => {
    // Opus 5 acumuló más en el periodo; Opus 5.5, el que se usa ahora, no
    // puede acabar en "Otros" ni en gris.
    const rows = [
      row("2026-10-01", "claude-opus-5", 40),
      row("2026-10-01", "claude-sonnet-5", 20),
      row("2026-10-01", "claude-fable-5-1", 15),
      row("2026-10-01", "claude-sonnet-4-5", 12),
      row("2026-10-01", "claude-opus-5-5", 5),
      row("2026-10-01", "claude-haiku-4-5", 1),
    ];
    const s = costSeries(rows, undefined, new Date("2026-10-01T10:00:00Z"));
    expect(s.models).toEqual(["Opus", "Sonnet", "Fable", "Otros"]);
    expect(s.days[0]?.byModel.Opus).toBe(45);
    expect(s.days[0]?.byModel.Sonnet).toBe(32);
    expect(s.days[0]?.byModel.Otros).toBe(1);
  });

  it("modelFamily", () => {
    expect(modelFamily("claude-opus-5-5")).toBe("Opus");
    expect(modelFamily("claude-sonnet-5")).toBe("Sonnet");
    expect(modelFamily("<synthetic>")).toBe("<synthetic>");
    expect(modelFamily("")).toBe("(sin modelo)");
  });
});

describe("etiquetas y actividad", () => {
  it("modelLabel y projectLabel", () => {
    expect(modelLabel("claude-opus-5-5")).toBe("Opus 5.5");
    expect(modelLabel("claude-sonnet-5")).toBe("Sonnet 5");
    expect(modelLabel("")).toBe("(sin modelo)");
    expect(projectLabel("/home/x/amnis-copilot")).toBe("amnis-copilot");
    expect(projectLabel("")).toBe("(sin proyecto)");
  });

  it("racha: días seguidos hasta hoy, o hasta ayer si hoy aún no hay nada", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    const rows = [
      row("2026-10-09", "a", 1),
      row("2026-10-08", "a", 1),
      row("2026-10-05", "a", 1),
    ];
    expect(activity(rows, now)).toEqual({ active: 3, streak: 2 });
  });
});
