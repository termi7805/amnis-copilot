import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DAEMON_MESSAGES_EN,
  DAEMON_MESSAGES_ES,
  formatMessage,
  type MessageKey,
  msg,
} from "@amnis/shared";

const params = (template: string) =>
  [...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

test("formatMessage interpola los parámetros en cada idioma", () => {
  const m = msg("health.hooks.missing", { events: "Stop, Notification" });
  assert.equal(
    formatMessage("es", m),
    "Faltan hooks de Amnis: Stop, Notification.",
  );
  assert.equal(
    formatMessage("en", m),
    "Missing Amnis hooks: Stop, Notification.",
  );
});

test("un parámetro que es otro mensaje se formatea en el mismo idioma", () => {
  const m = msg("spotify.sessionInvalid", {
    reason: msg("spotify.rejected", { status: 400, detail: "invalid_grant" }),
  });
  assert.equal(
    formatMessage("en", m),
    "The Spotify session is no longer valid: Spotify rejected the request (400): invalid_grant.",
  );
});

test("una clave desconocida (daemon más nuevo que el cliente) sale tal cual", () => {
  const m = { key: "algo.nuevo" as MessageKey };
  assert.equal(formatMessage("en", m), "algo.nuevo");
});

test("español e inglés usan los mismos parámetros en cada clave", () => {
  for (const key of Object.keys(DAEMON_MESSAGES_ES) as MessageKey[]) {
    assert.deepEqual(
      params(DAEMON_MESSAGES_EN[key]),
      params(DAEMON_MESSAGES_ES[key]),
      key,
    );
  }
});
