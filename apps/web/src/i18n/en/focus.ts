import type { focus as es } from "../es/focus.ts";
import type { Messages } from "../messages.ts";

export const focus: Messages<typeof es> = {
  label: "Pet focus",
  auto: "Automatic",
  all: "All",
  loadFailed: "Couldn't load the session list.",
  loading: "Looking for sessions…",
  empty: "No sessions yet. Open Claude Code in a repo.",
  ago: "{{elapsed}} ago",
  ended: "ended",
  showEnded: "Show ended",
} as const;
