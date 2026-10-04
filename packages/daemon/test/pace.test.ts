import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exhaustsAt,
  type PaceSample,
  projectAtReset,
} from "../src/domain/pace.ts";

const START = new Date("2026-01-01T10:00:00.000Z");
const RESET = new Date("2026-01-01T15:00:00.000Z");
const MIN = 60_000;

/** Una muestra cada 3 min con el ritmo dado (%/h), desde el inicio de la ventana. */
function linear(perHour: number, minutes: number, stepMin = 3): PaceSample[] {
  const out: PaceSample[] = [];
  for (let m = 0; m <= minutes; m += stepMin) {
    out.push({
      at: new Date(START.getTime() + m * MIN),
      utilization: (perHour * m) / 60,
    });
  }
  return out;
}

test("serie lineal de 10 %/h desde el inicio: da el valor exacto al reset", () => {
  const projected = projectAtReset(linear(10, 120), START, RESET);
  assert.ok(projected !== null);
  assert.ok(Math.abs(projected - 50) < 1e-9, `esperaba 50, dio ${projected}`);
});

test("con dos muestras no hay ritmo: null", () => {
  assert.equal(projectAtReset(linear(10, 120).slice(0, 2), START, RESET), null);
});

test("con muestras que abarcan menos de 10 min: null", () => {
  assert.equal(projectAtReset(linear(10, 9, 3), START, RESET), null);
});

test("sin muestras: null", () => {
  assert.equal(projectAtReset([], START, RESET), null);
});

test("una pendiente negativa es ruido: se proyecta el valor actual", () => {
  const samples: PaceSample[] = [30, 29, 28, 27].map((u, i) => ({
    at: new Date(START.getTime() + (60 + i * 5) * MIN),
    utilization: u,
  }));
  assert.equal(projectAtReset(samples, START, RESET), 27);
});

test("ignora las muestras de la ventana anterior (la ventana es fija)", () => {
  const anterior: PaceSample[] = [0, 1, 2, 3].map((i) => ({
    at: new Date(START.getTime() - (i + 1) * 5 * MIN),
    utilization: 90 + i,
  }));
  const projected = projectAtReset(
    [...anterior, ...linear(10, 120)],
    START,
    RESET,
  );
  assert.ok(projected !== null && Math.abs(projected - 50) < 1e-9);
});

test("solo cuenta la última hora: un ritmo antiguo distinto no pesa", () => {
  // 0-60 min a 30 %/h (llega a 30); luego 60-120 min a 10 %/h.
  const rapido = linear(30, 60);
  const lento: PaceSample[] = [];
  for (let m = 63; m <= 120; m += 3) {
    lento.push({
      at: new Date(START.getTime() + m * MIN),
      utilization: 30 + (10 * (m - 60)) / 60,
    });
  }
  const projected = projectAtReset([...rapido, ...lento], START, RESET);
  // Último: 40 % a los 120 min; faltan 180 min a 10 %/h → 70.
  assert.ok(projected !== null && Math.abs(projected - 70) < 1e-6);
});

test("la última muestra en el reset o después: null", () => {
  const samples = linear(10, 300);
  assert.equal(projectAtReset(samples, START, RESET), null);
});

test("sin recorte a 100: pasarse es una señal real", () => {
  const projected = projectAtReset(linear(40, 120), START, RESET);
  assert.ok(projected !== null && projected > 100);
});

/** Muestras cada 3 min en la última hora, de `desde` % a `hasta` %, hasta `finMin`. */
function lastHour(desde: number, hasta: number, finMin: number): PaceSample[] {
  const out: PaceSample[] = [];
  for (let m = finMin - 60; m <= finMin; m += 3) {
    out.push({
      at: new Date(START.getTime() + m * MIN),
      utilization: desde + ((hasta - desde) * (m - (finMin - 60))) / 60,
    });
  }
  return out;
}

// «Ahora» = 12:00, reset a 3 h vista (15:00).
const AHORA = 120;

test("50 → 70 % en la última hora: se agota en 1 h 30 min", () => {
  const at = exhaustsAt(lastHour(50, 70, AHORA), START, RESET);
  assert.ok(at !== null);
  const esperado = START.getTime() + (AHORA + 90) * MIN;
  assert.ok(Math.abs(at.getTime() - esperado) < MIN);
});

test("20 → 30 % en la última hora: el 100 % cae después del reset", () => {
  const at = exhaustsAt(lastHour(20, 30, AHORA), START, RESET);
  assert.ok(at !== null && at.getTime() > RESET.getTime());
});

test("muestras planas: sin hora", () => {
  assert.equal(exhaustsAt(lastHour(40, 40, AHORA), START, RESET), null);
});

test("pendiente negativa (ruido): sin hora", () => {
  assert.equal(exhaustsAt(lastHour(40, 35, AHORA), START, RESET), null);
});

test("pocas muestras o sin muestras: sin hora", () => {
  assert.equal(
    exhaustsAt(lastHour(50, 70, AHORA).slice(0, 2), START, RESET),
    null,
  );
  assert.equal(exhaustsAt([], START, RESET), null);
});

test("ya en el 100 %: la hora es la de la última muestra", () => {
  const muestras = lastHour(90, 100, AHORA);
  assert.deepEqual(exhaustsAt(muestras, START, RESET), muestras.at(-1)?.at);
});

test("coherente con la proyección: pasa de 100 si y solo si se agota antes del reset", () => {
  for (const [desde, hasta] of [
    [20, 30],
    [50, 70],
    [10, 60],
    [30, 31],
  ] as const) {
    const m = lastHour(desde, hasta, AHORA);
    const proy = projectAtReset(m, START, RESET);
    const at = exhaustsAt(m, START, RESET);
    assert.ok(proy !== null && at !== null);
    assert.equal(
      proy > 100,
      at.getTime() < RESET.getTime(),
      `${desde}→${hasta}`,
    );
  }
});
