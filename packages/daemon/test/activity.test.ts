import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ActivityEvent,
  clipSegments,
  heatmap,
  minutesByState,
  segmentsFromEvents,
  waitingSummary,
} from "../src/domain/activity.ts";

process.env.TZ = "Europe/Madrid";

const TIMEOUT = 10 * 60_000;
const MIN = 60_000;

/** Hora local de un lunes (2026-10-05) para que el mapa caiga en la fila 0. */
const at = (h: number, m = 0, s = 0) =>
  new Date(2026, 9, 5, h, m, s).toISOString();
const ev = (
  sessionId: string,
  ts: string,
  derivedState: string,
): ActivityEvent => ({ sessionId, ts, derivedState });
const NOW = new Date(2026, 9, 5, 23, 0);
const dur = (s: { start: number; end: number }) => (s.end - s.start) / MIN;

test("los eventos del mismo estado forman un solo tramo", () => {
  const segs = segmentsFromEvents(
    [
      ev("a", at(10, 0), "coding"),
      ev("a", at(10, 3), "coding"),
      ev("a", at(10, 6), "testing"),
    ],
    TIMEOUT,
    NOW,
  );
  assert.deepEqual(
    segs.map((s) => [s.state, dur(s)]),
    [
      ["coding", 6],
      ["testing", 10],
    ],
  );
});

test("una sesión abandonada no pasa del tope tras su último evento", () => {
  const [seg] = segmentsFromEvents(
    [ev("a", at(12, 0), "coding")],
    TIMEOUT,
    NOW,
  );
  assert.equal(dur(seg as never), 10);
});

test("un hueco mayor que el tope parte el tramo aunque el estado se repita", () => {
  const segs = segmentsFromEvents(
    [ev("a", at(10, 0), "coding"), ev("a", at(11, 0), "coding")],
    TIMEOUT,
    NOW,
  );
  assert.deepEqual(segs.map(dur), [10, 10]);
});

test("un tramo en curso no pasa de `now`", () => {
  const [seg] = segmentsFromEvents(
    [ev("a", at(10, 0), "coding")],
    TIMEOUT,
    new Date(2026, 9, 5, 10, 2),
  );
  assert.equal(dur(seg as never), 2);
});

test("un unknown alarga el trabajo pero cierra waiting", () => {
  const working = segmentsFromEvents(
    [
      ev("a", at(10, 0), "coding"),
      ev("a", at(10, 5), "unknown"),
      ev("a", at(10, 8), "testing"),
    ],
    TIMEOUT,
    NOW,
  );
  assert.deepEqual(
    working.map((s) => [s.state, dur(s)]),
    [
      ["coding", 8],
      ["testing", 10],
    ],
  );

  const waiting = segmentsFromEvents(
    [
      ev("a", at(10, 0), "waiting"),
      ev("a", at(10, 4), "unknown"),
      ev("a", at(10, 5), "terminal"),
    ],
    TIMEOUT,
    NOW,
  );
  assert.deepEqual(
    waiting.map((s) => [s.state, dur(s)]),
    [
      ["waiting", 4],
      ["terminal", 10],
    ],
  );
});

test("los eventos sin sesión se descartan", () => {
  const segs = segmentsFromEvents(
    [{ sessionId: null, ts: at(10), derivedState: "coding" }],
    TIMEOUT,
    NOW,
  );
  assert.deepEqual(segs, []);
});

test("dos sesiones solapadas: byState suma lo mismo que los tramos", () => {
  const segs = segmentsFromEvents(
    [
      ev("a", at(10, 0), "coding"),
      ev("b", at(10, 2), "researching"),
      ev("a", at(10, 5), "waiting"),
      ev("b", at(10, 6), "coding"),
      ev("a", at(10, 9), "terminal"),
      ev("b", at(10, 12), "resting"),
    ],
    TIMEOUT,
    NOW,
  );
  assert.deepEqual(new Set(segs.map((s) => s.sessionId)), new Set(["a", "b"]));

  const total = Object.values(minutesByState(segs)).reduce((a, b) => a + b, 0);
  const sum = segs.reduce((acc, s) => acc + dur(s), 0);
  assert.equal(total, sum);
  // Y supera al reloj: de 10:00 a 10:22 solo hay 22 min de pared.
  assert.ok(total > 22);
});

test("waitingSummary cuenta minutos y avisos", () => {
  const segs = segmentsFromEvents(
    [
      ev("a", at(10, 0), "waiting"),
      ev("a", at(10, 3), "coding"),
      ev("a", at(10, 5), "waiting"),
      ev("a", at(10, 6), "coding"),
    ],
    TIMEOUT,
    NOW,
  );
  assert.deepEqual(waitingSummary(segs), { minutes: 4, count: 2 });
});

test("clipSegments recorta a medianoche y descarta lo de fuera", () => {
  const midnight = new Date(2026, 9, 6).getTime();
  const segs = segmentsFromEvents(
    [ev("a", at(23, 55), "coding"), ev("b", at(9, 0), "coding")],
    TIMEOUT,
    new Date(2026, 9, 6, 1, 0),
  );
  const clipped = clipSegments(segs, midnight, midnight + 24 * 60 * MIN);
  assert.equal(clipped.length, 1);
  assert.equal(dur(clipped[0] as never), 5);
});

test("heatmap reparte un tramo que cruza la hora y deja fuera resting", () => {
  const segs = segmentsFromEvents(
    [
      ev("a", at(10, 55), "coding"),
      ev("a", at(11, 5), "resting"),
      ev("b", at(14, 0), "resting"),
    ],
    TIMEOUT,
    NOW,
  );
  const grid = heatmap(segs);
  assert.equal(grid.length, 7);
  assert.ok(grid.every((row) => row.length === 24));
  // Lunes (fila 0): coding 10:55–11:05 → 5 min en la hora 10 y 5 en la 11.
  assert.equal(grid[0]?.[10], 5);
  assert.equal(grid[0]?.[11], 5);
  assert.equal(grid[0]?.[14], 0);
});
