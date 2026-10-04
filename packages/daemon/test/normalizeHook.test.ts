import assert from "node:assert/strict";
import { test } from "node:test";
import { anthropicProvider } from "../src/infrastructure/providers/anthropic/index.ts";

function normalize(payload: Record<string, unknown>) {
  return anthropicProvider.normalizeHookEvent({ session_id: "s1", ...payload });
}

test("SessionEnd guarda `reason` y SessionStart guarda `source`", () => {
  const end = normalize({ hook_event_name: "SessionEnd", reason: "clear" });
  const start = normalize({
    hook_event_name: "SessionStart",
    source: "resume",
  });

  assert.equal(end?.sessionReason, "clear");
  assert.equal(start?.sessionReason, "resume");
  assert.equal(end?.sessionId, "s1");
});

test("los demás hooks no arrastran `reason`/`source` aunque el payload los traiga", () => {
  const event = normalize({
    hook_event_name: "Notification",
    reason: "x",
    source: "y",
  });

  assert.equal(event?.sessionReason, null);
});

test("un motivo que no es string queda en null", () => {
  const event = normalize({ hook_event_name: "SessionEnd", reason: 3 });

  assert.equal(event?.sessionReason, null);
});

test("Notification guarda `notification_type`", () => {
  const event = normalize({
    hook_event_name: "Notification",
    notification_type: "idle_prompt",
  });

  assert.equal(event?.notificationType, "idle_prompt");
});

test("los demás hooks no arrastran `notification_type`, y un valor que no es string queda en null", () => {
  const stop = normalize({
    hook_event_name: "Stop",
    notification_type: "permission_prompt",
  });
  const bad = normalize({
    hook_event_name: "Notification",
    notification_type: 3,
  });
  const missing = normalize({ hook_event_name: "Notification" });

  assert.equal(stop?.notificationType, null);
  assert.equal(bad?.notificationType, null);
  assert.equal(missing?.notificationType, null);
});
