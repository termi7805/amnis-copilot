import assert from "node:assert/strict";
import { test } from "node:test";
import type { FeaturesResult } from "../src/infrastructure/providers/reccobeats/features.ts";
import { createTrackVibes } from "../src/infrastructure/trackVibe.ts";

function setup(
  respond: (id: string) => FeaturesResult | Promise<FeaturesResult>,
  maxEntries?: number,
) {
  const calls: string[] = [];
  const vibes = createTrackVibes({
    fetchFeatures: async (id) => {
      calls.push(id);
      return respond(id);
    },
    ...(maxEntries !== undefined && { maxEntries }),
  });
  return { vibes, calls };
}

const party: FeaturesResult = {
  ok: true,
  features: { bpm: 128, energy: 0.9, valence: 0.9 },
};

test("la misma canción dos veces hace una sola consulta", async () => {
  const { vibes, calls } = setup(() => party);
  assert.deepEqual(await vibes.resolve("a"), { vibe: "fiesta", bpm: 128 });
  assert.deepEqual(await vibes.resolve("a"), { vibe: "fiesta", bpm: 128 });
  assert.deepEqual(vibes.peek("a"), { vibe: "fiesta", bpm: 128 });
  assert.deepEqual(calls, ["a"]);
});

test("dos resolve simultáneos de la misma pista comparten la consulta", async () => {
  const { vibes, calls } = setup(
    () => new Promise((r) => setTimeout(() => r(party), 20)),
  );
  const [a, b] = await Promise.all([vibes.resolve("a"), vibes.resolve("a")]);
  assert.deepEqual(a, b);
  assert.equal(calls.length, 1);
});

test("fuera de catálogo se cachea como neutral: no se vuelve a preguntar", async () => {
  const { vibes, calls } = setup(() => ({ ok: true, features: null }));
  assert.deepEqual(await vibes.resolve("a"), { vibe: "neutral", bpm: null });
  await vibes.resolve("a");
  assert.equal(calls.length, 1);
  assert.deepEqual(vibes.peek("a"), { vibe: "neutral", bpm: null });
});

test("un fallo da neutral y NO se cachea: la próxima vez se reintenta", async () => {
  let up = false;
  const { vibes, calls } = setup(() =>
    up ? party : { ok: false, message: "caído" },
  );
  assert.deepEqual(await vibes.resolve("a"), { vibe: "neutral", bpm: null });
  assert.equal(vibes.peek("a"), undefined);
  up = true;
  assert.deepEqual(await vibes.resolve("a"), { vibe: "fiesta", bpm: 128 });
  assert.equal(calls.length, 2);
});

test("resolve nunca rechaza, aunque fetchFeatures lance", async () => {
  const vibes = createTrackVibes({
    fetchFeatures: async () => {
      throw new Error("boom");
    },
  });
  assert.deepEqual(await vibes.resolve("a"), { vibe: "neutral", bpm: null });
});

test("LRU: pasado el máximo se desaloja el menos reciente", async () => {
  const { vibes, calls } = setup(() => party, 2);
  await vibes.resolve("a");
  await vibes.resolve("b");
  await vibes.resolve("c"); // desaloja "a"
  assert.equal(vibes.peek("a"), undefined);
  assert.ok(vibes.peek("b"));
  assert.ok(vibes.peek("c"));
  await vibes.resolve("a");
  assert.deepEqual(calls, ["a", "b", "c", "a"]);
});

test("LRU: un acierto reciente sobrevive al desalojo", async () => {
  const { vibes } = setup(() => party, 2);
  await vibes.resolve("a");
  await vibes.resolve("b");
  vibes.peek("a"); // "a" pasa a ser la más reciente
  await vibes.resolve("c"); // desaloja "b", no "a"
  assert.ok(vibes.peek("a"));
  assert.equal(vibes.peek("b"), undefined);
});
