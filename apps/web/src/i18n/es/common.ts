export const common = {
  connection: {
    connected: "conectado",
    reconnecting: "reconectando…",
    offline: "sin conexión",
  },
  errors: {
    unreachable: "No se pudo contactar con Amnis.",
    status: "Amnis respondió {{status}}.",
    spotifyStatus: "Spotify respondió {{status}}.",
    invalidResponse: "Respuesta de Amnis no válida.",
  },
  countdown: {
    now: "ahora",
    days: "{{days}}d {{hours}}h",
    hours: "{{hours}}h {{minutes}}m",
    minutes: "{{minutes}}m",
    minutesLong: "{{minutes}} min",
  },
  views: {
    ahora: "Ahora",
    historico: "Histórico",
    actividad: "Actividad",
    ajustes: "Ajustes",
  },
  nav: {
    label: "Vistas",
    daemon: "Daemon {{status}}",
    quit: "Cerrar Amnis",
    warnings_one: "{{count}} aviso de salud",
    warnings_other: "{{count}} avisos de salud",
  },
} as const;
