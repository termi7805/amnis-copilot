import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_SETTINGS,
  type PetFocus,
  type QuotaSnapshot,
} from "@amnis/shared";
import {
  commitHashFrom,
  type GetStateDeps,
  getState,
  type LastKnownStateEvent,
  type LiveSessionCandidate,
  othersActiveFrom,
  projectName,
  quotaExhausted,
} from "../src/application/getState.ts";
import { emptyMedia } from "../src/infrastructure/providers/spotify/player.ts";

const STARTED_AT = "2026-01-01T00:00:00.000Z";
const NOW = new Date("2026-01-01T01:00:00.000Z");

function makeQuota(overrides: Partial<QuotaSnapshot> = {}): QuotaSnapshot {
  return {
    provider: "anthropic",
    authoritative: null,
    local: {
      fiveHourTokens: 0,
      fiveHourUtilization: 0,
      windowStartedAt: STARTED_AT,
      calibrated: true,
      ceilingWindows: 3,
      provisionalUtilization: null,
    },
    divergence: null,
    projection: { fiveHourAtReset: null, fiveHourExhaustsAt: null },
    sampledAt: NOW.toISOString(),
    error: null,
    rateLimitedAt: null,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<GetStateDeps> = {}): GetStateDeps {
  return {
    version: "0.0.1",
    startedAt: STARTED_AT,
    focus: () => ({ kind: "auto" }),
    lastKnownStateEvent: () => null,
    liveSessionCandidates: () => [],
    countHookEvents: () => 0,
    countUsageEvents: () => 0,
    latestQuotas: () => Promise.resolve([makeQuota()]),
    media: () => Promise.resolve(emptyMedia("not-configured", STARTED_AT)),
    listening: () => null,
    settings: () => DEFAULT_SETTINGS,
    skins: () => ({ rev: 1, skins: [] }),
    plan: () => null,
    update: () => null,
    readCommitHash: () => {
      throw new Error("readCommitHash no debería llamarse en este test");
    },
    ...overrides,
  };
}

test("projectName: último tramo de la ruta, null sin cwd", () => {
  assert.equal(projectName("/home/x/amnis-copilot"), "amnis-copilot");
  assert.equal(projectName("/home/x/amnis-copilot/"), "amnis-copilot");
  assert.equal(projectName("C:\\src\\amnis"), "amnis");
  assert.equal(projectName(null), null);
  assert.equal(projectName("/"), null);
});

test("sin eventos nunca: sleeping, since = startedAt", async () => {
  const state = await getState(makeDeps(), NOW);

  assert.equal(state.pet.state, "sleeping");
  assert.equal(state.pet.since, STARTED_AT);
});

test("evento reciente: el estado y el reason reflejan el último evento con estado conocido", async () => {
  const event: LastKnownStateEvent = {
    hook: "PreToolUse",
    toolName: "Edit",
    derivedState: "coding",
    ts: new Date(NOW.getTime() - 1000).toISOString(),
    project: null,
    stateEnteredAt: new Date(NOW.getTime() - 1000).toISOString(),
  };
  const state = await getState(
    makeDeps({ lastKnownStateEvent: () => event }),
    NOW,
  );

  assert.equal(state.pet.state, "coding");
  assert.equal(state.pet.since, event.stateEnteredAt);
  assert.ok(state.pet.reason.includes("Edit"));
});

test("since es stateEnteredAt, no el ts del último evento — una racha de varios PreToolUse en el mismo estado no la reinicia", async () => {
  const event: LastKnownStateEvent = {
    hook: "PreToolUse",
    toolName: "Edit",
    derivedState: "coding",
    ts: new Date(NOW.getTime() - 1000).toISOString(),
    project: null,
    stateEnteredAt: new Date(NOW.getTime() - 20 * 60_000).toISOString(),
  };
  const state = await getState(
    makeDeps({ lastKnownStateEvent: () => event }),
    NOW,
  );

  assert.equal(state.pet.since, event.stateEnteredAt);
  assert.notEqual(state.pet.since, event.ts);
});

test("evento antiguo (> 10 min): sleeping, la inactividad se mide por ts, no por stateEnteredAt", async () => {
  const event: LastKnownStateEvent = {
    hook: "PreToolUse",
    toolName: "Edit",
    derivedState: "coding",
    ts: new Date(NOW.getTime() - 15 * 60_000).toISOString(),
    project: null,
    stateEnteredAt: new Date(NOW.getTime() - 15 * 60_000).toISOString(),
  };
  const state = await getState(
    makeDeps({ lastKnownStateEvent: () => event }),
    NOW,
  );

  assert.equal(state.pet.state, "sleeping");
  assert.equal(state.pet.since, event.stateEnteredAt);
});

test("eventsReceived y usageEvents reflejan lo que devuelven las deps", async () => {
  const state = await getState(
    makeDeps({ countHookEvents: () => 42, countUsageEvents: () => 7 }),
    NOW,
  );

  assert.equal(state.daemon.eventsReceived, 42);
  assert.equal(state.daemon.usageEvents, 7);
  assert.equal(state.daemon.startedAt, STARTED_AT);
});

test("quotas conserva el provider de cada entrada", async () => {
  const state = await getState(
    makeDeps({
      latestQuotas: () =>
        Promise.resolve([makeQuota({ provider: "anthropic" })]),
    }),
    NOW,
  );

  assert.equal(state.quotas.length, 1);
  assert.equal(state.quotas[0]?.provider, "anthropic");
});

test("fatiga se clampea a [0,1] aunque la utilización venga por encima de 100", async () => {
  const state = await getState(
    makeDeps({
      latestQuotas: () =>
        Promise.resolve([
          makeQuota({
            authoritative: {
              fiveHour: { utilization: 150, resetsAt: null },
              sevenDay: { utilization: 10, resetsAt: null },
              limits: [],
              weeklyBreakdown: null,
            },
          }),
        ]),
    }),
    NOW,
  );

  assert.equal(state.pet.fatigue, 1);
});

test("fatiga usa la vía local cuando no hay autoritativa", async () => {
  const state = await getState(
    makeDeps({
      latestQuotas: () =>
        Promise.resolve([
          makeQuota({
            local: {
              fiveHourTokens: 1000,
              fiveHourUtilization: 40,
              windowStartedAt: STARTED_AT,
              calibrated: true,
              ceilingWindows: 3,
              provisionalUtilization: null,
            },
          }),
        ]),
    }),
    NOW,
  );

  assert.equal(state.pet.fatigue, 0.4);
});

test("cuota autoritativa al 100%: limited gana a sleeping", async () => {
  const state = await getState(
    makeDeps({
      latestQuotas: () =>
        Promise.resolve([
          makeQuota({
            authoritative: {
              fiveHour: { utilization: 100, resetsAt: null },
              sevenDay: { utilization: 10, resetsAt: null },
              limits: [],
              weeklyBreakdown: null,
            },
          }),
        ]),
    }),
    NOW,
  );

  assert.equal(state.pet.state, "limited");
});

test("cuota local al 100% sin autoritativa: no dispara limited", () => {
  assert.equal(
    quotaExhausted([
      makeQuota({
        local: {
          fiveHourTokens: 1000,
          fiveHourUtilization: 100,
          windowStartedAt: STARTED_AT,
          calibrated: true,
          ceilingWindows: 3,
          provisionalUtilization: null,
        },
      }),
    ]),
    false,
  );
});

test("cuota autoritativa por debajo de 100%: no dispara limited", () => {
  assert.equal(
    quotaExhausted([
      makeQuota({
        authoritative: {
          fiveHour: { utilization: 99, resetsAt: null },
          sevenDay: { utilization: 10, resetsAt: null },
          limits: [],
          weeklyBreakdown: null,
        },
      }),
    ]),
    false,
  );
});

test("pushing con project: commitHash sale de readCommitHash(project)", async () => {
  const event: LastKnownStateEvent = {
    hook: "PreToolUse",
    toolName: "Bash",
    derivedState: "pushing",
    ts: NOW.toISOString(),
    project: "/repo",
    stateEnteredAt: NOW.toISOString(),
  };
  const state = await getState(
    makeDeps({
      lastKnownStateEvent: () => event,
      readCommitHash: (project) => (project === "/repo" ? "a1b2c3d" : null),
    }),
    NOW,
  );

  assert.equal(state.pet.commitHash, "a1b2c3d");
});

test("committing nunca llama a readCommitHash: HEAD todavía es el commit anterior", async () => {
  const event: LastKnownStateEvent = {
    hook: "PreToolUse",
    toolName: "Bash",
    derivedState: "committing",
    ts: NOW.toISOString(),
    project: "/repo",
    stateEnteredAt: NOW.toISOString(),
  };
  const state = await getState(
    makeDeps({ lastKnownStateEvent: () => event }),
    NOW,
  );

  assert.equal(state.pet.commitHash, null);
});

test("pushing sin project: commitHash null sin llamar a readCommitHash", async () => {
  const event: LastKnownStateEvent = {
    hook: "PreToolUse",
    toolName: "Bash",
    derivedState: "pushing",
    ts: NOW.toISOString(),
    project: null,
    stateEnteredAt: NOW.toISOString(),
  };
  const state = await getState(
    makeDeps({ lastKnownStateEvent: () => event }),
    NOW,
  );

  assert.equal(state.pet.commitHash, null);
});

test("commitHashFrom: null si readCommitHash no encuentra un repo", () => {
  const event: LastKnownStateEvent = {
    hook: "PreToolUse",
    toolName: "Bash",
    derivedState: "pushing",
    ts: NOW.toISOString(),
    project: "/no-es-un-repo",
    stateEnteredAt: NOW.toISOString(),
  };

  assert.equal(
    commitHashFrom(
      {
        state: "pushing",
        since: NOW.toISOString(),
        reason: "x",
        project: null,
      },
      event,
      () => null,
    ),
    null,
  );
});

test("pet.listening sale de deps.listening()", async () => {
  const listening = {
    vibe: "chill" as const,
    bpm: 90,
    track: { id: "t1", title: "T", artist: "A", imageUrl: null },
  };
  const state = await getState(makeDeps({ listening: () => listening }), NOW);
  assert.deepEqual(state.pet.listening, listening);
});

test("settings: las preferencias de deps.settings() viajan en el hello", async () => {
  const prefs = { ...DEFAULT_SETTINGS, enabled: false, screenSeconds: 3 };
  const state = await getState(makeDeps({ settings: () => prefs }), NOW);
  assert.deepEqual(state.settings, prefs);
});

test("plan: el plan resuelto de deps.plan() viaja en la respuesta", async () => {
  const plan = {
    id: "pro",
    label: "Pro",
    monthlyUsd: 20,
    source: "detected" as const,
  };
  const state = await getState(makeDeps({ plan: () => plan }), NOW);
  assert.deepEqual(state.plan, plan);
});

test("getState filtra con el foco de deps.focus() y lo devuelve en el snapshot", async () => {
  const focus = { kind: "worktree", worktree: "/r/wt" } as const;
  const seen: unknown[] = [];
  const deps = makeDeps({
    focus: () => focus,
    lastKnownStateEvent: (f) => {
      seen.push(f);
      return null;
    },
  });

  const state = await getState(deps, NOW);

  assert.deepEqual(seen, [focus]);
  assert.deepEqual(state.pet.focus, focus);
});

function live(
  sessionId: string,
  overrides: Partial<LiveSessionCandidate> = {},
): LiveSessionCandidate {
  return {
    sessionId,
    lastEventAt: new Date(NOW.getTime() - 60_000).toISOString(),
    ended: false,
    repoRoot: "/r",
    worktree: "/r-1",
    ...overrides,
  };
}

test("othersActiveFrom: en auto y all no hay otras, el foco ya las mira a todas", () => {
  assert.equal(othersActiveFrom({ kind: "auto" }, [live("A")], NOW), 0);
  assert.equal(othersActiveFrom({ kind: "all" }, [live("A")], NOW), 0);
});

test("othersActiveFrom: cuenta las vivas que el foco deja fuera, sea sesión, worktree o repo", () => {
  const sessions = [
    live("A"),
    live("B", { worktree: "/r-2" }),
    live("C", { repoRoot: "/otro", worktree: "/otro-1" }),
  ];
  const session: PetFocus = {
    kind: "session",
    sessionId: "A",
    worktree: "/r-1",
  };
  const worktree: PetFocus = { kind: "worktree", worktree: "/r-1" };
  const repo: PetFocus = { kind: "repo", repoRoot: "/r" };
  assert.equal(othersActiveFrom(session, sessions, NOW), 2);
  assert.equal(othersActiveFrom(worktree, sessions, NOW), 2);
  assert.equal(othersActiveFrom(repo, sessions, NOW), 1);
});

test("othersActiveFrom: una terminada o inactiva no cuenta; una sin repo cuenta fuera de un foco de repo", () => {
  const focus: PetFocus = { kind: "repo", repoRoot: "/r" };
  const stale = new Date(NOW.getTime() - 11 * 60_000).toISOString();
  const sessions = [
    live("A"),
    live("ended", { repoRoot: "/x", worktree: "/x-1", ended: true }),
    live("idle", { repoRoot: "/x", worktree: "/x-1", lastEventAt: stale }),
    live("sin-repo", { repoRoot: null, worktree: null }),
  ];
  assert.equal(othersActiveFrom(focus, sessions, NOW), 1);
});

test("getState rellena othersActive con las sesiones de la ventana de inactividad", async () => {
  const sinces: Date[] = [];
  const state = await getState(
    makeDeps({
      focus: () => ({ kind: "worktree", worktree: "/r-1" }),
      liveSessionCandidates: (s) => {
        sinces.push(s);
        return [live("A"), live("B", { worktree: "/r-2" })];
      },
    }),
    NOW,
  );
  assert.equal(state.pet.othersActive, 1);
  assert.equal(sinces[0]?.toISOString(), "2026-01-01T00:50:00.000Z");
});
