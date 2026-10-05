import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AmnisEvent,
  DEFAULT_SETTINGS,
  type StateResponse,
} from "@amnis/shared";
import { createEventBroadcaster } from "../src/infrastructure/http/events.ts";
import { createEventsRoute } from "../src/infrastructure/http/routes/events.ts";
import { createHttpServer } from "../src/infrastructure/http/server.ts";
import { emptyMedia } from "../src/infrastructure/providers/spotify/player.ts";

const HELLO_STATE: StateResponse = {
  pet: {
    state: "sleeping",
    since: "2026-01-01T00:00:00.000Z",
    fatigue: 0,
    level: 1,
    reason: "sin eventos",
    commitHash: null,
    project: null,
    listening: null,
    focus: { kind: "auto" },
    othersActive: 0,
    sessions: null,
  },
  quotas: [],
  media: emptyMedia("not-configured", "2026-01-01T00:00:00.000Z"),
  settings: DEFAULT_SETTINGS,
  skins: { rev: 1, skins: [] },
  plan: null,
  update: null,
  daemon: {
    version: "0.0.1",
    startedAt: "2026-01-01T00:00:00.000Z",
    eventsReceived: 0,
    usageEvents: 0,
  },
};

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  const { value } = await reader.read();
  return new TextDecoder().decode(value);
}

test("GET /api/events: cabeceras SSE, retry y hello inmediato", async () => {
  const broadcaster = createEventBroadcaster(3_600_000);
  const server = createHttpServer({
    routes: {
      "GET /api/events": createEventsRoute({
        broadcaster,
        hello: () => Promise.resolve(HELLO_STATE),
      }),
    },
  });
  const port = await server.listen(0);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/events`);
    assert.equal(response.headers.get("content-type"), "text/event-stream");

    const reader = response.body?.getReader();
    assert.ok(reader);
    const text = await readChunk(reader);

    assert.match(text, /^retry: 2000\n\n/);
    assert.match(text, /event: hello\n/);
    assert.match(text, /"state":"sleeping"/);

    await reader.cancel();
  } finally {
    broadcaster.stop();
    await server.close();
  }
});

test("GET /api/events: un broadcast posterior llega al cliente conectado", async () => {
  const broadcaster = createEventBroadcaster(3_600_000);
  const server = createHttpServer({
    routes: {
      "GET /api/events": createEventsRoute({
        broadcaster,
        hello: () => Promise.resolve(HELLO_STATE),
      }),
    },
  });
  const port = await server.listen(0);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/events`);
    const reader = response.body?.getReader();
    assert.ok(reader);
    await readChunk(reader); // retry + hello

    const event: AmnisEvent = {
      event: "state",
      data: {
        state: "coding",
        since: "x",
        fatigue: 0.1,
        level: 1,
        reason: "PreToolUse Edit",
        commitHash: null,
        project: null,
        listening: null,
        focus: { kind: "auto" },
        othersActive: 0,
        sessions: null,
      },
    };
    broadcaster.broadcast(event);

    const text = await readChunk(reader);
    assert.match(text, /event: state\n/);
    assert.match(text, /"state":"coding"/);

    await reader.cancel();
  } finally {
    broadcaster.stop();
    await server.close();
  }
});
