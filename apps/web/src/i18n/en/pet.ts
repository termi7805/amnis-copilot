import type { pet as es } from "../es/pet.ts";
import type { Messages } from "../messages.ts";

export const pet: Messages<typeof es> = {
  states: {
    coding: "Writing code",
    testing: "Running tests",
    researching: "Looking things up",
    planning: "Planning",
    waiting: "Waiting for permission",
    resting: "Resting",
    sleeping: "Sleeping",
    terminal: "Running a command",
    subagents: "Handing out work",
    committing: "Committing",
    pushing: "Pushing to the remote",
    limited: "Limit reached",
  },
  vibes: {
    fiesta: "party",
    intensa: "intense",
    chill: "chill",
    melancolica: "melancholic",
    podcast: "podcast",
    neutral: "neutral",
  },
  others_one: "{{state}} · +{{count}} active session",
  others_other: "{{state}} · +{{count}} active sessions",
  offline: "Offline",
  window: {
    hooksMissing: "Claude Code isn't connected",
    repair: "Repair",
    repairing: "Repairing…",
    refreshQuota: "Reload quota",
    stale: "Data from {{elapsed}} ago",
    exhausts: "Runs out <b>{{time}}</b> · in {{countdown}}",
    now: "Now",
    panel: "Panel",
    quota: "Quota",
    music: "Music",
    openDashboard: "Open dashboard",
  },
  ring: {
    noData: "no data",
    noEndpointData: "no endpoint data",
    estimated: "estimated",
  },
};
