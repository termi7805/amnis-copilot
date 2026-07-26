import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAN_WINDOW_TOKENS } from "../src/config.ts";
import {
  calibrate,
  estimate,
  FIVE_HOUR_MS,
  findGapStart,
  windowStart,
} from "../src/domain/localQuota.ts";

test("windowStart sin lastReset devuelve now", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  assert.equal(windowStart(now).getTime(), now.getTime());
});

test("windowStart con lastReset reciente: misma ventana, no avanza", () => {
  const lastReset = new Date("2026-01-01T10:00:00Z");
  const now = new Date("2026-01-01T12:00:00Z"); // 2h después, dentro de la ventana
  assert.equal(windowStart(now, lastReset).getTime(), lastReset.getTime());
});

test("windowStart con lastReset antiguo: avanza en saltos de 5h hasta cubrir now", () => {
  const lastReset = new Date("2026-01-01T00:00:00Z");
  // 13h después: 2 ventanas completas (10h) + 3h dentro de la tercera
  const now = new Date("2026-01-01T13:00:00Z");

  const result = windowStart(now, lastReset);

  const expected = new Date(lastReset.getTime() + 2 * FIVE_HOUR_MS);
  assert.equal(result.getTime(), expected.getTime());
  assert.ok(result.getTime() <= now.getTime());
  assert.ok(result.getTime() + FIVE_HOUR_MS > now.getTime());
});

test("windowStart con endpoint (resetsAt - 5h): 0 saltos, mismo resultado", () => {
  const resetsAt = new Date("2026-01-01T15:00:00Z");
  const lastReset = new Date(resetsAt.getTime() - FIVE_HOUR_MS);
  const now = new Date("2026-01-01T11:00:00Z"); // dentro de esa ventana

  assert.equal(windowStart(now, lastReset).getTime(), lastReset.getTime());
});

test("estimate: tokens/ceiling*100, sin clamping por encima de 100", () => {
  assert.equal(estimate(22_000, 44_000), 50);
  assert.equal(estimate(50_000, 44_000) > 100, true);
});

test("calibrate: techo = tokens / (utilization/100)", () => {
  assert.equal(calibrate(22_000, 50), 44_000);
});

test("calibrate devuelve null por debajo del 10% (ruido)", () => {
  assert.equal(calibrate(1000, 9), null);
  assert.notEqual(calibrate(1000, 10), null);
});

test("findGapStart: lista vacía devuelve null", () => {
  assert.equal(findGapStart([], FIVE_HOUR_MS), null);
});

test("findGapStart: sin huecos devuelve el primer timestamp", () => {
  const t0 = new Date("2026-01-01T00:00:00Z");
  const t1 = new Date("2026-01-01T01:00:00Z");
  const t2 = new Date("2026-01-01T02:00:00Z");

  assert.equal(
    findGapStart([t0, t1, t2], FIVE_HOUR_MS)?.getTime(),
    t0.getTime(),
  );
});

test("findGapStart: con un hueco > 5h devuelve el evento que sigue al hueco", () => {
  const t0 = new Date("2026-01-01T00:00:00Z");
  const t1 = new Date("2026-01-01T01:00:00Z");
  const t2 = new Date(t1.getTime() + FIVE_HOUR_MS + 60_000); // hueco > 5h

  assert.equal(
    findGapStart([t0, t1, t2], FIVE_HOUR_MS)?.getTime(),
    t2.getTime(),
  );
});

test("Hecho cuando: promediar varias muestras calibradas se acerca más al techo real que el default del plan", () => {
  // El techo real de esta cuenta difiere del valor por defecto del plan
  // (DESIGN.md: PLAN_WINDOW_TOKENS son aproximaciones, no la verdad).
  const realCeiling = 95_000;
  const defaultCeiling = PLAN_WINDOW_TOKENS.max_5x as number;

  // Muestras sintéticas: tokens locales reales para varios niveles de uso,
  // con el ruido de redondeo a entero que el endpoint real produce.
  const samples: Array<{ tokens: number; utilization: number }> = [
    { tokens: 39_600, utilization: Math.round((39_600 / realCeiling) * 100) },
    { tokens: 57_200, utilization: Math.round((57_200 / realCeiling) * 100) },
    { tokens: 66_000, utilization: Math.round((66_000 / realCeiling) * 100) },
    { tokens: 30_800, utilization: Math.round((30_800 / realCeiling) * 100) },
    { tokens: 74_800, utilization: Math.round((74_800 / realCeiling) * 100) },
  ];

  const calibrated = samples
    .map((s) => calibrate(s.tokens, s.utilization))
    .filter((c): c is number => c !== null);

  const avgCalibrated =
    calibrated.reduce((sum, c) => sum + c, 0) / calibrated.length;

  const errorCalibrated = Math.abs(avgCalibrated - realCeiling);
  const errorDefault = Math.abs(defaultCeiling - realCeiling);

  assert.ok(
    errorCalibrated < errorDefault,
    `calibrado (${avgCalibrated}, error ${errorCalibrated}) debería acercarse más al real (${realCeiling}) que el default (${defaultCeiling}, error ${errorDefault})`,
  );
});
