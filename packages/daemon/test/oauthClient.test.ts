import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRefreshRequest } from "../src/infrastructure/providers/anthropic/oauthClient.ts";

test("buildRefreshRequest arma un POST con grant_type=refresh_token", () => {
  const req = buildRefreshRequest("my-refresh-token", "test-client-id");

  assert.equal(req.method, "POST");
  assert.equal(req.url, "https://platform.claude.com/v1/oauth/token");
  assert.equal(req.headers["Content-Type"], "application/json");

  const body = JSON.parse(req.body);
  assert.equal(body.grant_type, "refresh_token");
  assert.equal(body.refresh_token, "my-refresh-token");
  assert.equal(body.client_id, "test-client-id");
});

test("buildRefreshRequest usa el client_id por defecto si no se inyecta uno", () => {
  const req = buildRefreshRequest("t");
  const body = JSON.parse(req.body);

  assert.equal(body.client_id, "9d1c250a-e61b-44d9-88ed-5944d1962f5e");
});
