import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchLatestRelease } from "../src/infrastructure/providers/github/releases.ts";

const RELEASE = {
  tag_name: "v0.3.0",
  html_url: "https://github.com/termi7805/amnis-copilot/releases/tag/v0.3.0",
};

const respond = (body: unknown, status = 200) =>
  (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("lee tag_name y html_url de la última release, con User-Agent", async () => {
  let headers: Headers | undefined;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    headers = new Headers(init.headers);
    return new Response(JSON.stringify(RELEASE));
  }) as unknown as typeof fetch;
  assert.deepEqual(await fetchLatestRelease({ fetchImpl }), {
    tag: "v0.3.0",
    url: RELEASE.html_url,
  });
  assert.match(headers?.get("User-Agent") ?? "", /^amnis-copilot\//);
});

test("nunca lanza: red caída, 403, 429 y cuerpo sin campos son {error}", async () => {
  const failing = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  assert.ok("error" in (await fetchLatestRelease({ fetchImpl: failing })));
  for (const status of [403, 429, 404]) {
    const reading = await fetchLatestRelease({
      fetchImpl: respond({}, status),
    });
    assert.ok("error" in reading);
  }
  const empty = await fetchLatestRelease({ fetchImpl: respond({ name: "x" }) });
  assert.ok("error" in empty);
});

test("una html_url fuera de las releases del repo se rechaza", async () => {
  const reading = await fetchLatestRelease({
    fetchImpl: respond({ ...RELEASE, html_url: "https://evil.example/x" }),
  });
  assert.ok("error" in reading);
});
