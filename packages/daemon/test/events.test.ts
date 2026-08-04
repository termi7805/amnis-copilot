import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import type { AmnisEvent } from "@amnis/shared";
import { createEventBroadcaster } from "../src/infrastructure/http/events.ts";

function fakeClient(): { res: ServerResponse; chunks: string[] } {
  const chunks: string[] = [];
  const res = {
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
  } as unknown as ServerResponse;
  return { res, chunks };
}

const EVENT: AmnisEvent = {
  event: "state",
  data: {
    state: "coding",
    since: "2026-01-01T00:00:00.000Z",
    fatigue: 0,
    level: 1,
    reason: "x",
    commitHash: null,
  },
};

test("broadcast escribe id/event/data a un cliente registrado", () => {
  const broadcaster = createEventBroadcaster(3_600_000);
  const { res, chunks } = fakeClient();

  broadcaster.register(res);
  broadcaster.broadcast(EVENT);
  broadcaster.stop();

  const text = chunks.join("");
  assert.match(text, /^id: \d+\n/);
  assert.match(text, /event: state\n/);
  assert.match(text, /data: \{.*"state":"coding".*\}\n\n$/);
});

test("varios clientes reciben el mismo broadcast", () => {
  const broadcaster = createEventBroadcaster(3_600_000);
  const a = fakeClient();
  const b = fakeClient();
  broadcaster.register(a.res);
  broadcaster.register(b.res);

  broadcaster.broadcast(EVENT);
  broadcaster.stop();

  assert.equal(a.chunks.length, 3);
  assert.equal(b.chunks.length, 3);
});

test("un cliente desregistrado no recibe nada", () => {
  const broadcaster = createEventBroadcaster(3_600_000);
  const { res, chunks } = fakeClient();
  broadcaster.register(res);
  broadcaster.unregister(res);

  broadcaster.broadcast(EVENT);
  broadcaster.stop();

  assert.equal(chunks.length, 0);
});

test("heartbeat escribe un comentario SSE a cada cliente en cada intervalo", async () => {
  const broadcaster = createEventBroadcaster(10);
  const { res, chunks } = fakeClient();
  broadcaster.register(res);

  await sleep(35);
  broadcaster.stop();

  assert.ok(
    chunks.length >= 2,
    `esperaba varios heartbeats, hubo ${chunks.length}`,
  );
  assert.ok(chunks.every((c) => c === ": heartbeat\n\n"));
});
