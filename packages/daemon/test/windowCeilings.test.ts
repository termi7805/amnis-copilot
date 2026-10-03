import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureAccount } from "../src/infrastructure/persistence/accounts.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import {
  closedWindowCeilings,
  normalizeWindowEnd,
  saveWindowCeiling,
} from "../src/infrastructure/persistence/windowCeilings.ts";

const NOW = new Date("2026-01-10T00:00:00.000Z");

test("normalizeWindowEnd: el jitter de resets_at cae en el mismo minuto", () => {
  assert.equal(
    normalizeWindowEnd("2026-01-01T15:50:00.030191Z"),
    normalizeWindowEnd("2026-01-01T15:49:59.637Z"),
  );
  assert.equal(
    normalizeWindowEnd("2026-01-01T15:49:59.637Z"),
    "2026-01-01T15:50:00.000Z",
  );
});

test("la misma ventana con jitter es una sola fila y la última muestra gana", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  saveWindowCeiling(db, accountId, "pro", {
    windowEnd: "2026-01-01T15:50:00.030191Z",
    tokens: 10,
    utilization: 40,
  });
  saveWindowCeiling(db, accountId, "pro", {
    windowEnd: "2026-01-01T15:49:59.637Z",
    tokens: 20,
    utilization: 80,
  });

  assert.deepEqual(closedWindowCeilings(db, accountId, "pro", NOW, 7), [
    { tokens: 20, utilization: 80 },
  ]);
});

test("solo ventanas cerradas, del plan vigente, las más recientes primero y con límite", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");
  const save = (day: string, plan: string, tokens: number) =>
    saveWindowCeiling(db, accountId, plan, {
      windowEnd: `2026-01-${day}T10:00:00.000Z`,
      tokens,
      utilization: 50,
    });
  save("01", "pro", 1);
  save("02", "pro", 2);
  save("03", "pro", 3);
  save("04", "max_5x", 4); // otro plan: se descarta
  save("20", "pro", 99); // aún no cerrada (después de NOW)

  const tokens = (n: number) =>
    closedWindowCeilings(db, accountId, "pro", NOW, n).map((w) => w.tokens);

  assert.deepEqual(tokens(7), [3, 2, 1]);
  assert.deepEqual(tokens(2), [3, 2]);
});
