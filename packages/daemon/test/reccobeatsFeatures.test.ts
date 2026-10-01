import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchFeatures } from "../src/infrastructure/providers/reccobeats/features.ts";

const ID = "0VjIjW4GlUZAMYd2vXMi3b";

function fakeFetch(response: Response | Error | "hang") {
  const calls: { url: string; userAgent: string | null }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      userAgent: new Headers(init?.headers).get("User-Agent"),
    });
    if (response === "hang") {
      // No resuelve nunca, pero respeta la señal de timeout como el fetch real.
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("timeout")),
        );
      });
    }
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
  return { impl, calls };
}

const body = (content: unknown) => Response.json({ content });

test("pide el ID pelado con User-Agent propio y mapea tempo, energía y valencia", async () => {
  const f = fakeFetch(body([{ tempo: 171.001, energy: 0.73, valence: 0.33 }]));
  const result = await fetchFeatures(ID, { fetch: f.impl });
  assert.deepEqual(result, {
    ok: true,
    features: { bpm: 171, energy: 0.73, valence: 0.33 },
  });
  assert.equal(
    f.calls[0]?.url,
    `https://api.reccobeats.com/v1/audio-features?ids=${ID}`,
  );
  assert.match(f.calls[0]?.userAgent ?? "", /^amnis-copilot\//);
});

test("fuera de catálogo (content vacío) es ok sin features, no un fallo", async () => {
  const result = await fetchFeatures(ID, { fetch: fakeFetch(body([])).impl });
  assert.deepEqual(result, { ok: true, features: null });
});

test("un tempo no utilizable da bpm null pero conserva la vibe", async () => {
  for (const tempo of [0, -3, "rápido", null, undefined]) {
    const result = await fetchFeatures(ID, {
      fetch: fakeFetch(body([{ tempo, energy: 0.4, valence: 0.6 }])).impl,
    });
    assert.deepEqual(result, {
      ok: true,
      features: { bpm: null, energy: 0.4, valence: 0.6 },
    });
  }
});

test("404, 429 y 500 son fallos", async () => {
  for (const status of [404, 429, 500]) {
    const result = await fetchFeatures(ID, {
      fetch: fakeFetch(new Response(null, { status })).impl,
    });
    assert.equal(result.ok, false, String(status));
  }
});

test("red caída es un fallo", async () => {
  const result = await fetchFeatures(ID, {
    fetch: fakeFetch(new Error("sin red")).impl,
  });
  assert.equal(result.ok, false);
});

test("ReccoBeats colgado: falla rápido por el timeout", async () => {
  const started = Date.now();
  const result = await fetchFeatures(ID, {
    fetch: fakeFetch("hang").impl,
    timeoutMs: 30,
  });
  assert.equal(result.ok, false);
  assert.ok(Date.now() - started < 1000);
});

test("JSON roto y forma inesperada son fallos", async () => {
  const notJson = await fetchFeatures(ID, {
    fetch: fakeFetch(new Response("<html>")).impl,
  });
  assert.equal(notJson.ok, false);
  const noContent = await fetchFeatures(ID, {
    fetch: fakeFetch(Response.json({ otra: 1 })).impl,
  });
  assert.equal(noContent.ok, false);
  const noMetrics = await fetchFeatures(ID, {
    fetch: fakeFetch(body([{ tempo: 100 }])).impl,
  });
  assert.equal(noMetrics.ok, false);
});

test("un ID que no es de Spotify (pista local, vacío, raro) no hace ninguna petición", async () => {
  for (const id of ["", "abc", "x".repeat(22) + "&ids=otro", "../../etc"]) {
    const f = fakeFetch(body([]));
    const result = await fetchFeatures(id, { fetch: f.impl });
    assert.deepEqual(result, { ok: true, features: null }, id);
    assert.equal(f.calls.length, 0, id);
  }
});
