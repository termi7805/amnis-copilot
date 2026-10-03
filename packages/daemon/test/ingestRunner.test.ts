import assert from "node:assert/strict";
import { test } from "node:test";
import { createIngestRunner } from "../src/infrastructure/ingestRunner.ts";

/** Un `spawn` falso cuyas ejecuciones se resuelven a mano. */
function fakeSpawn() {
  const calls: Array<{
    rebuild: boolean;
    resolve(): void;
    reject(err: Error): void;
  }> = [];
  return {
    calls,
    spawn: (options: { rebuild: boolean }) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ rebuild: options.rebuild, resolve, reject });
      }),
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("dos muestras seguidas comparten la ingesta en vuelo", async () => {
  const { calls, spawn } = fakeSpawn();
  const runner = createIngestRunner({ spawn });

  const first = runner.ensureFresh();
  const second = runner.ensureFresh();
  assert.equal(calls.length, 1);

  calls[0]?.resolve();
  assert.deepEqual(await Promise.all([first, second]), ["fresh", "fresh"]);
});

test("una pasada correcta reciente se da por buena sin lanzar otra; una vieja no", async () => {
  const { calls, spawn } = fakeSpawn();
  let nowMs = Date.parse("2026-01-01T12:00:00Z");
  const runner = createIngestRunner({
    spawn,
    maxAgeMs: 30_000,
    now: () => new Date(nowMs),
  });

  const first = runner.ensureFresh();
  calls[0]?.resolve();
  await first;

  nowMs += 10_000;
  assert.equal(await runner.ensureFresh(), "fresh");
  assert.equal(calls.length, 1);

  nowMs += 21_000;
  const third = runner.ensureFresh();
  assert.equal(calls.length, 2);
  calls[1]?.resolve();
  await third;
});

test("una ingesta fallida no rechaza: devuelve failed, guarda el error y se reintenta", async () => {
  const { calls, spawn } = fakeSpawn();
  const runner = createIngestRunner({ spawn });

  const first = runner.ensureFresh();
  calls[0]?.reject(new Error("database is locked"));
  assert.equal(await first, "failed");
  assert.equal(runner.lastRun()?.error, "database is locked");

  // Un fallo no cuenta como "reciente": la siguiente muestra lo vuelve a intentar.
  const second = runner.ensureFresh();
  assert.equal(calls.length, 2);
  calls[1]?.resolve();
  assert.equal(await second, "fresh");
  assert.equal(runner.lastRun()?.error, null);
});

test("con una reconstrucción en curso la ingesta automática no se lanza", async () => {
  const { calls, spawn } = fakeSpawn();
  const runner = createIngestRunner({ spawn });

  const rebuild = runner.rebuild();
  await tick();
  assert.deepEqual(
    calls.map((c) => c.rebuild),
    [true],
  );

  assert.equal(await runner.ensureFresh(), "skipped-rebuild");
  assert.equal(calls.length, 1);

  calls[0]?.resolve();
  await rebuild;
  // Una reconstrucción correcta cuenta como última pasada: no hace falta otra.
  assert.equal(await runner.ensureFresh(), "fresh");
  assert.equal(calls.length, 1);
});

test("rebuild espera a una ingesta automática en vuelo y no corren a la vez", async () => {
  const { calls, spawn } = fakeSpawn();
  const runner = createIngestRunner({ spawn });

  const auto = runner.ensureFresh();
  const rebuild = runner.rebuild();
  await tick();
  assert.deepEqual(
    calls.map((c) => c.rebuild),
    [false],
  );

  calls[0]?.resolve();
  await auto;
  await tick();
  assert.deepEqual(
    calls.map((c) => c.rebuild),
    [false, true],
  );

  calls[1]?.resolve();
  await rebuild;
});

test("una reconstrucción fallida rechaza, anota el error y libera el ejecutor", async () => {
  const { calls, spawn } = fakeSpawn();
  const runner = createIngestRunner({ spawn });

  const rebuild = runner.rebuild();
  await tick();
  calls[0]?.reject(new Error("disco lleno"));
  await assert.rejects(rebuild, /disco lleno/);
  assert.equal(runner.lastRun()?.error, "disco lleno");

  const auto = runner.ensureFresh();
  assert.equal(calls.length, 2);
  calls[1]?.resolve();
  assert.equal(await auto, "fresh");
});
