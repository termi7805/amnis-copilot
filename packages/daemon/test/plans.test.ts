import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS } from "@amnis/shared";
import { detectPlanId, PLANS, resolvePlan } from "../src/domain/plans.ts";
import { sanitizeSettings, validateSettings } from "../src/domain/settings.ts";
import { currentPlan } from "../src/infrastructure/currentPlan.ts";
import type { CredentialsResult } from "../src/infrastructure/providers/anthropic/credentials.ts";

test("detectPlanId: pro, y max según el rateLimitTier", () => {
  assert.equal(detectPlanId("pro", "default_claude_ai"), "pro");
  assert.equal(detectPlanId("max", "default_claude_max_5x"), "max_5x");
  assert.equal(detectPlanId("max", "default_claude_max_20x"), "max_20x");
});

test("detectPlanId: lo no concluyente o desconocido es null, nunca una apuesta", () => {
  assert.equal(detectPlanId("max", "default_claude_ai"), null);
  assert.equal(detectPlanId("max", null), null);
  assert.equal(detectPlanId("enterprise", null), null);
  assert.equal(detectPlanId(null, null), null);
});

test("resolvePlan: lo detectado gana a lo manual", () => {
  const plan = resolvePlan("pro", "max_5x");
  assert.equal(plan?.id, "pro");
  assert.equal(plan?.source, "detected");
  assert.equal(plan?.monthlyUsd, PLANS.pro?.monthlyUsd);
});

test("resolvePlan: sin detectado, el manual; sin ninguno, null", () => {
  assert.deepEqual(resolvePlan(null, "max_5x"), {
    id: "max_5x",
    label: "Max 5x",
    monthlyUsd: 100,
    source: "manual",
  });
  assert.equal(resolvePlan(null, null), null);
  assert.equal(resolvePlan("desconocido", null), null);
  assert.equal(resolvePlan(null, "desconocido"), null);
});

function creds(
  subscriptionType: string | null,
  rateLimitTier: string | null = null,
): () => CredentialsResult {
  return () => ({
    ok: true,
    token: {
      accessToken: "x",
      expiresAt: null,
      subscriptionType,
      rateLimitTier,
      source: "file",
    },
  });
}

test("currentPlan: un subscriptionType desconocido da null hasta que hay un manual", () => {
  assert.equal(currentPlan(null, creds("enterprise")), null);
  assert.equal(currentPlan("max_5x", creds("enterprise"))?.source, "manual");
});

test("currentPlan: sin sesión, manda el manual; con sesión, el detectado", () => {
  const sinSesion = () =>
    ({ ok: false, reason: "no-session", message: "" }) as CredentialsResult;
  assert.equal(currentPlan("max_20x", sinSesion)?.id, "max_20x");
  const plan = currentPlan("max_5x", creds("pro", "default_claude_ai"));
  assert.equal(plan?.id, "pro");
  assert.equal(plan?.source, "detected");
});

test("validateSettings: plan conocido o null se acepta; otro, error de campo", () => {
  const ok = validateSettings({ plan: "max_5x" }, DEFAULT_SETTINGS);
  assert.ok(ok.ok && ok.settings.plan === "max_5x");
  const cleared = validateSettings(
    { plan: null },
    { ...DEFAULT_SETTINGS, plan: "pro" },
  );
  assert.ok(cleared.ok && cleared.settings.plan === null);

  const bad = validateSettings({ plan: "inventado" }, DEFAULT_SETTINGS);
  assert.ok(!bad.ok && bad.field === "plan");
});

test("validateSettings: un cambio de música no toca el plan, y sigue validando", () => {
  const current = { ...DEFAULT_SETTINGS, plan: "pro" };
  const res = validateSettings({ enabled: false }, current);
  assert.ok(res.ok && res.settings.plan === "pro" && !res.settings.enabled);
  const bad = validateSettings({ damping: 9 }, current);
  assert.ok(!bad.ok && bad.field === "damping");
});

test("sanitizeSettings: un fichero antiguo sin plan da null; un plan inválido, null", () => {
  assert.equal(sanitizeSettings({ enabled: false }).plan, null);
  assert.equal(sanitizeSettings({ plan: "inventado" }).plan, null);
  assert.equal(sanitizeSettings({ plan: "pro" }).plan, "pro");
});

const SESSION_FOCUS = {
  kind: "session",
  sessionId: "abc",
  worktree: "/home/x/repo-1",
} as const;

test("validateSettings: acepta los cuatro tipos de petFocus", () => {
  for (const petFocus of [
    { kind: "auto" },
    { kind: "repo", repoRoot: "/home/x/repo" },
    { kind: "worktree", worktree: "/home/x/repo-1" },
    SESSION_FOCUS,
  ]) {
    const res = validateSettings({ petFocus }, DEFAULT_SETTINGS);
    assert.ok(res.ok, JSON.stringify(petFocus));
    assert.deepEqual(res.settings.petFocus, petFocus);
  }
});

test("validateSettings: un petFocus malformado da error de campo", () => {
  for (const petFocus of [
    null,
    [],
    "auto",
    {},
    { kind: "inventado" },
    { kind: "repo" },
    { kind: "repo", repoRoot: "" },
    { kind: "repo", repoRoot: 3 },
    { kind: "repo", repo_root: "/x" },
    { kind: "auto", extra: 1 },
    { kind: "session", sessionId: "abc" },
    { kind: "worktree", worktree: "/x", repoRoot: "/y" },
    { kind: "toString" },
  ]) {
    const bad = validateSettings({ petFocus }, DEFAULT_SETTINGS);
    assert.ok(!bad.ok && bad.field === "petFocus", JSON.stringify(petFocus));
  }
});

test("validateSettings: otro cambio conserva el petFocus; uno nuevo lo sustituye entero", () => {
  const current = { ...DEFAULT_SETTINGS, petFocus: SESSION_FOCUS };
  const kept = validateSettings({ enabled: false }, current);
  assert.ok(kept.ok);
  assert.deepEqual(kept.settings.petFocus, SESSION_FOCUS);
  const replaced = validateSettings({ petFocus: { kind: "auto" } }, current);
  assert.ok(replaced.ok);
  assert.deepEqual(replaced.settings.petFocus, { kind: "auto" });
});

test("sanitizeSettings: petFocus ausente o malformado da auto; válido se conserva", () => {
  const auto = { kind: "auto" };
  assert.deepEqual(sanitizeSettings({}).petFocus, auto);
  assert.deepEqual(sanitizeSettings(null).petFocus, auto);
  assert.deepEqual(sanitizeSettings({ petFocus: "x" }).petFocus, auto);
  assert.deepEqual(
    sanitizeSettings({ petFocus: { kind: "repo" } }).petFocus,
    auto,
  );
  assert.deepEqual(
    sanitizeSettings({ petFocus: SESSION_FOCUS }).petFocus,
    SESSION_FOCUS,
  );
});
