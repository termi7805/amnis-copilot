import type { common as es } from "../es/common.ts";
import type { Messages } from "../messages.ts";

export const common: Messages<typeof es> = {
  connection: {
    connected: "connected",
    reconnecting: "reconnecting…",
    offline: "offline",
  },
  errors: {
    unreachable: "Could not reach Amnis.",
    status: "Amnis responded {{status}}.",
    spotifyStatus: "Spotify responded {{status}}.",
    invalidResponse: "Invalid response from Amnis.",
  },
  countdown: {
    now: "now",
    days: "{{days}}d {{hours}}h",
    hours: "{{hours}}h {{minutes}}m",
    minutes: "{{minutes}}m",
    minutesLong: "{{minutes}} min",
  },
  views: {
    ahora: "Now",
    historico: "History",
    actividad: "Activity",
    ajustes: "Settings",
  },
  nav: {
    label: "Views",
    daemon: "Daemon {{status}}",
    quit: "Quit Amnis",
    warnings_one: "{{count}} health warning",
    warnings_other: "{{count}} health warnings",
  },
};
