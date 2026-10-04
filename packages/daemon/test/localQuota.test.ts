import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAN_WINDOW_TOKENS } from "../src/config.ts";
import {
  calibrate,
  ceilingWindowCount,
  estimate,
  FIVE_HOUR_MS,
  findGapStart,
  provisionalCeiling,
  robustCeiling,
  windowStart,
} from "../src/domain/localQuota.ts";

const H = 60 * 60_000;
const at = (iso: string) => new Date(iso);
/** Primer ts ≥ t entre los dados, como hace la consulta SQL. */
const firstOf = (stamps: Date[]) => (t: Date) =>
  stamps
    .filter((d) => d.getTime() >= t.getTime())
    .sort((x, y) => x.getTime() - y.getTime())[0] ?? null;

test("windowStart con reset futuro: la ventana empezó en reset − 5h", () => {
  const now = at("2026-01-01T12:00:00Z");
  const reset = at("2026-01-01T15:00:00Z");
  const start = windowStart(now, reset, () => null);
  assert.equal(start?.getTime(), reset.getTime() - FIVE_HOUR_MS);
});

test("windowStart con reset pasado: primer evento posterior al reset", () => {
  const now = at("2026-01-01T12:00:00Z");
  const reset = at("2026-01-01T05:00:00Z");
  const first = at("2026-01-01T09:30:00Z");
  const start = windowStart(
    now,
    reset,
    firstOf([at("2026-01-01T04:00:00Z"), first]),
  );
  assert.equal(start?.getTime(), first.getTime());
});

test("windowStart encadena ventanas cerradas hasta una que contenga now", () => {
  const now = at("2026-01-01T20:00:00Z");
  const reset = at("2026-01-01T00:00:00Z");
  const stamps = [
    at("2026-01-01T01:00:00Z"), // ventana 1: 01:00–06:00
    at("2026-01-01T07:00:00Z"), // ventana 2: 07:00–12:00
    at("2026-01-01T15:30:00Z"), // ventana 3: 15:30–20:30, contiene now
    at("2026-01-01T16:00:00Z"),
  ];
  const start = windowStart(now, reset, firstOf(stamps));
  assert.equal(start?.getTime(), at("2026-01-01T15:30:00Z").getTime());
});

test("windowStart con reset pasado y sin evento posterior: sin ventana activa", () => {
  const now = at("2026-01-01T12:00:00Z");
  const reset = new Date(now.getTime() - 7 * H);
  assert.equal(
    windowStart(now, reset, () => null),
    null,
  );
});

test("windowStart: ventana cerrada y sin evento posterior: sin ventana activa", () => {
  const now = at("2026-01-01T20:00:00Z");
  const reset = at("2026-01-01T00:00:00Z");
  assert.equal(
    windowStart(now, reset, firstOf([at("2026-01-01T01:00:00Z")])),
    null,
  );
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

test("calibrate devuelve null con 0 tokens: no hay nada que calibrar", () => {
  assert.equal(calibrate(0, 50), null);
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

const win = (ceiling: number) => ({ tokens: ceiling / 2, utilization: 50 });

test("robustCeiling: la mediana de las ventanas cerradas, no la última", () => {
  assert.equal(
    robustCeiling([win(70), win(90), win(60)].map((w) => ({ ...w }))),
    70,
  );
});

test("robustCeiling: con menos de 3 ventanas, null (sin calibrar)", () => {
  assert.equal(robustCeiling([win(70), win(90)]), null);
});

test("robustCeiling: solo cuentan las 7 más recientes y las pares promedian el centro", () => {
  const recent = [10, 20, 30, 40, 50, 60].map(win); // 6 → mediana 35
  const old = [1000, 1000, 1000].map(win); // quedan fuera: ya hay 9
  assert.equal(robustCeiling([...recent, win(70), ...old]), 40);
  assert.equal(robustCeiling(recent), 35);
});

test("provisionalCeiling: con 1 ventana su techo, con 2 la media", () => {
  assert.equal(provisionalCeiling([win(90)]), 90);
  assert.equal(provisionalCeiling([win(90), win(70)]), 80);
});

test("provisionalCeiling: null con 0 ventanas y con 3 o más (manda robustCeiling)", () => {
  assert.equal(provisionalCeiling([]), null);
  assert.equal(provisionalCeiling([win(70), win(90), win(60)]), null);
});

test("provisionalCeiling y ceilingWindowCount: una ventana de ruido (< 10 %) no cuenta", () => {
  const noisy = { tokens: 5, utilization: 5 };
  assert.equal(provisionalCeiling([noisy]), null);
  assert.equal(ceilingWindowCount([noisy, win(90)]), 1);
  assert.equal(provisionalCeiling([noisy, win(90)]), 90);
});
