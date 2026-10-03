import assert from "node:assert/strict";
import { test } from "node:test";
import { SEED_PRICES } from "../src/domain/cost.ts";
import { ensureAccount } from "../src/infrastructure/persistence/accounts.ts";
import { openDb } from "../src/infrastructure/persistence/db.ts";
import { aggregate } from "../src/infrastructure/persistence/usage.ts";
import { insertUsageEvent } from "../src/infrastructure/persistence/usageEvents.ts";

function insertEvent(
  db: ReturnType<typeof openDb>,
  accountId: number,
  opts: {
    dedupeKey: string;
    ts: string;
    project: string | null;
    model: string | null;
    input: number;
    output: number;
    cacheCreation?: number;
    cacheRead?: number;
    sessionId?: string;
  },
): void {
  insertUsageEvent(db, {
    accountId,
    provider: "anthropic",
    dedupeKey: opts.dedupeKey,
    sessionId: opts.sessionId ?? null,
    project: opts.project,
    ts: opts.ts,
    model: opts.model,
    inputTokens: opts.input,
    outputTokens: opts.output,
    cacheCreationTokens: opts.cacheCreation ?? 0,
    cacheReadTokens: opts.cacheRead ?? 0,
    serviceTier: null,
    gitBranch: null,
  });
}

test("los totales por proyecto cuadran con la suma de los eventos crudos", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertEvent(db, accountId, {
    dedupeKey: "a",
    ts: "2026-01-01T10:00:00.000Z",
    project: "/repo/a",
    model: "claude-sonnet-5",
    input: 100,
    output: 50,
  });
  insertEvent(db, accountId, {
    dedupeKey: "b",
    ts: "2026-01-01T11:00:00.000Z",
    project: "/repo/a",
    model: "claude-sonnet-5",
    input: 200,
    output: 100,
  });
  insertEvent(db, accountId, {
    dedupeKey: "c",
    ts: "2026-01-01T12:00:00.000Z",
    project: "/repo/b",
    model: "claude-opus-5",
    input: 1000,
    output: 0,
  });

  const { rows } = aggregate(
    db,
    accountId,
    { groupBy: "project" },
    SEED_PRICES,
  );

  const repoA = rows.find((r) => r.key === "/repo/a");
  assert.ok(repoA);
  assert.equal(repoA.inputTokens, 300);
  assert.equal(repoA.outputTokens, 150);

  const repoB = rows.find((r) => r.key === "/repo/b");
  assert.ok(repoB);
  assert.equal(repoB.inputTokens, 1000);
});

test("group by model combina el coste correcto cuando un grupo mezcla modelos con precios distintos", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertEvent(db, accountId, {
    dedupeKey: "sonnet",
    ts: "2026-01-01T10:00:00.000Z",
    project: "/repo",
    model: "claude-sonnet-5",
    input: 1_000_000,
    output: 0,
  });
  insertEvent(db, accountId, {
    dedupeKey: "opus",
    ts: "2026-01-01T11:00:00.000Z",
    project: "/repo",
    model: "claude-opus-5",
    input: 1_000_000,
    output: 0,
  });

  // Agrupado por día (misma fecha, dos modelos): el coste debe ser la suma
  // de cada modelo a SU precio, no los 2M tokens al precio de uno solo.
  const { rows } = aggregate(db, accountId, { groupBy: "day" }, SEED_PRICES);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.costUsd, 2.0 + 5.0);
});

test("el filtro from/to excluye lo que queda fuera del rango", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertEvent(db, accountId, {
    dedupeKey: "dentro",
    ts: "2026-01-05T00:00:00.000Z",
    project: "/repo",
    model: "claude-sonnet-5",
    input: 100,
    output: 0,
  });
  insertEvent(db, accountId, {
    dedupeKey: "antes",
    ts: "2026-01-01T00:00:00.000Z",
    project: "/repo",
    model: "claude-sonnet-5",
    input: 999,
    output: 0,
  });
  insertEvent(db, accountId, {
    dedupeKey: "despues",
    ts: "2026-01-10T00:00:00.000Z",
    project: "/repo",
    model: "claude-sonnet-5",
    input: 999,
    output: 0,
  });

  const { rows } = aggregate(
    db,
    accountId,
    {
      groupBy: "project",
      from: new Date("2026-01-02T00:00:00.000Z"),
      to: new Date("2026-01-08T00:00:00.000Z"),
    },
    SEED_PRICES,
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.inputTokens, 100);
});

test("modelo null no se descarta: aparece agrupado bajo su propia clave con coste 0", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertEvent(db, accountId, {
    dedupeKey: "sin-modelo",
    ts: "2026-01-01T00:00:00.000Z",
    project: "/repo",
    model: null,
    input: 100,
    output: 50,
  });

  const { rows, unpricedModels } = aggregate(
    db,
    accountId,
    { groupBy: "model" },
    SEED_PRICES,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.inputTokens, 100);
  assert.equal(rows[0]?.costUsd, 0);
  // null no es un modelo sin precio: no hay nombre que listar.
  assert.deepEqual(unpricedModels, []);
});

test("un modelo con tokens y sin precio sale en unpricedModels en vez de pasar por barato", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertEvent(db, accountId, {
    dedupeKey: "nuevo",
    ts: "2026-01-01T00:00:00.000Z",
    project: "/repo",
    model: "claude-modelo-futuro",
    input: 100,
    output: 0,
  });
  insertEvent(db, accountId, {
    dedupeKey: "haiku",
    ts: "2026-01-01T00:00:00.000Z",
    project: "/repo",
    model: "claude-haiku-4-5-20251001",
    input: 100,
    output: 0,
  });

  const { unpricedModels } = aggregate(
    db,
    accountId,
    { groupBy: "day" },
    SEED_PRICES,
  );
  assert.deepEqual(unpricedModels, ["claude-modelo-futuro"]);
});

test("por modelo, el ID con fecha y sin fecha salen en una sola fila sin el sufijo", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  insertEvent(db, accountId, {
    dedupeKey: "dated",
    ts: "2026-01-01T10:00:00.000Z",
    project: "/repo",
    model: "claude-haiku-4-5-20251001",
    input: 1_000_000,
    output: 0,
  });
  insertEvent(db, accountId, {
    dedupeKey: "plain",
    ts: "2026-01-01T11:00:00.000Z",
    project: "/repo",
    model: "claude-haiku-4-5",
    input: 1_000_000,
    output: 0,
  });

  const { rows } = aggregate(db, accountId, { groupBy: "model" }, SEED_PRICES);
  assert.deepEqual(
    rows.map((r) => [r.key, r.inputTokens, r.costUsd]),
    [["claude-haiku-4-5", 2_000_000, 2.0]],
  );
});

test("day,model separa los modelos dentro del día y une el mismo modelo con y sin sufijo de fecha", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  const base = { project: "/repo", output: 0 };
  insertEvent(db, accountId, {
    ...base,
    dedupeKey: "h1",
    ts: "2026-01-01T10:00:00.000Z",
    model: "claude-haiku-4-5-20251001",
    input: 100,
  });
  insertEvent(db, accountId, {
    ...base,
    dedupeKey: "h2",
    ts: "2026-01-01T11:00:00.000Z",
    model: "claude-haiku-4-5",
    input: 200,
  });
  insertEvent(db, accountId, {
    ...base,
    dedupeKey: "s1",
    ts: "2026-01-01T12:00:00.000Z",
    model: "claude-sonnet-5",
    input: 1_000_000,
  });

  const { rows } = aggregate(
    db,
    accountId,
    { groupBy: "day,model" },
    SEED_PRICES,
  );
  assert.deepEqual(
    rows.map((r) => [r.key, r.model, r.inputTokens]),
    [
      ["2026-01-01", "claude-haiku-4-5", 300],
      ["2026-01-01", "claude-sonnet-5", 1_000_000],
    ],
  );
});

test("la suma del coste cuadra por día, por proyecto y por día y modelo, con un modelo sin precio", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  const events: [string, string, string, string | null, number][] = [
    ["a", "2026-01-01T10:00:00.000Z", "/repo/a", "claude-sonnet-5", 700_000],
    ["b", "2026-01-01T11:00:00.000Z", "/repo/b", "claude-opus-5", 300_000],
    ["c", "2026-01-02T10:00:00.000Z", "/repo/a", "claude-opus-5", 500_000],
    ["d", "2026-01-02T11:00:00.000Z", "/repo/b", "modelo-sin-precio", 900_000],
    ["e", "2026-01-03T11:00:00.000Z", "/repo/a", null, 100_000],
  ];
  for (const [dedupeKey, ts, project, model, input] of events) {
    insertEvent(db, accountId, {
      dedupeKey,
      ts,
      project,
      model,
      input,
      output: 0,
    });
  }

  const total = (groupBy: "day" | "project" | "day,model") =>
    aggregate(db, accountId, { groupBy }, SEED_PRICES).rows.reduce(
      (sum, r) => sum + r.costUsd,
      0,
    );
  const expected = total("day");
  assert.ok(expected > 0);
  assert.ok(Math.abs(total("project") - expected) < 1e-9);
  assert.ok(Math.abs(total("day,model") - expected) < 1e-9);
});

test("las sesiones se cuentan distintas por fila; una con dos modelos es una, y sin session_id no cuenta", () => {
  const db = openDb(":memory:");
  const accountId = ensureAccount(db, "anthropic", "default");

  const base = { project: "/repo/a", input: 10, output: 0 };
  insertEvent(db, accountId, {
    ...base,
    dedupeKey: "1",
    ts: "2026-01-01T10:00:00.000Z",
    model: "claude-sonnet-5",
    sessionId: "s1",
  });
  insertEvent(db, accountId, {
    ...base,
    dedupeKey: "2",
    ts: "2026-01-01T10:01:00.000Z",
    model: "claude-opus-5",
    sessionId: "s1",
  });
  insertEvent(db, accountId, {
    ...base,
    dedupeKey: "3",
    ts: "2026-01-01T10:02:00.000Z",
    model: "claude-opus-5",
    sessionId: "s2",
  });
  insertEvent(db, accountId, {
    ...base,
    dedupeKey: "4",
    ts: "2026-01-01T10:03:00.000Z",
    model: "claude-opus-5",
  });

  const byProject = aggregate(
    db,
    accountId,
    { groupBy: "project" },
    SEED_PRICES,
  );
  assert.equal(byProject.rows[0]?.sessions, 2);

  const byDayModel = aggregate(
    db,
    accountId,
    { groupBy: "day,model" },
    SEED_PRICES,
  );
  assert.deepEqual(
    byDayModel.rows.map((r) => [r.model, r.sessions]),
    [
      ["claude-opus-5", 1 + 1],
      ["claude-sonnet-5", 1],
    ],
  );
});
