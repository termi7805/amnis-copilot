import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAuthorizeUrl,
  challengeFor,
  createPkcePair,
  SPOTIFY_SCOPES,
} from "../src/infrastructure/providers/spotify/oauth.ts";

test("challenge S256 coincide con el vector de la RFC 7636", () => {
  assert.equal(
    challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("createPkcePair genera verifier válido y su challenge", () => {
  const { verifier, challenge } = createPkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(challenge, challengeFor(verifier));
});

test("buildAuthorizeUrl lleva PKCE S256, scopes, redirect y state", () => {
  const url = new URL(
    buildAuthorizeUrl({
      clientId: "cid",
      redirectUri: "http://127.0.0.1:4747/api/spotify/callback",
      state: "st",
      challenge: "ch",
    }),
  );
  const p = url.searchParams;
  assert.equal(
    url.origin + url.pathname,
    "https://accounts.spotify.com/authorize",
  );
  assert.equal(p.get("response_type"), "code");
  assert.equal(p.get("client_id"), "cid");
  assert.equal(p.get("code_challenge_method"), "S256");
  assert.equal(p.get("code_challenge"), "ch");
  assert.equal(p.get("state"), "st");
  assert.equal(p.get("scope"), SPOTIFY_SCOPES);
  assert.equal(
    p.get("redirect_uri"),
    "http://127.0.0.1:4747/api/spotify/callback",
  );
});
