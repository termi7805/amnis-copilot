import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const VERSION = "0.0.1";

/** Puerto fijo por ahora; configurable via AMNIS_PORT. */
export const PORT = Number(process.env.AMNIS_PORT ?? 4747);

export const HOME = homedir();
export const CLAUDE_DIR =
  process.env.CLAUDE_CONFIG_DIR ?? join(HOME, ".claude");
export const CLAUDE_PROJECTS_DIR = join(CLAUDE_DIR, "projects");
export const CLAUDE_SETTINGS = join(CLAUDE_DIR, "settings.json");
export const CLAUDE_CREDENTIALS = join(CLAUDE_DIR, ".credentials.json");

/** Datos propios de Amnis. La BD de aquí es caché derivada: borrable. */
export const AMNIS_DIR = process.env.AMNIS_DIR ?? join(HOME, ".amnis");
export const DB_PATH = join(AMNIS_DIR, "amnis.sqlite");
/** Token refrescado por Amnis. Nunca de vuelta en ~/.claude/. Permisos 0600. */
export const TOKEN_CACHE_PATH = join(AMNIS_DIR, "token.json");

/** Intervalo seguro del endpoint OAuth. Menos que esto arriesga 429. */
export const QUOTA_POLL_MS = 180_000;

/** Sin eventos durante este tiempo, la mascota se duerme. */
export const SLEEP_AFTER_MS = 10 * 60_000;

/** Ventana de rate limit de Claude: 5 horas. */
export const WINDOW_MS = 5 * 60 * 60_000;

/**
 * Techo de tokens por ventana usado para la estimación local.
 * Es una aproximación por plan: el número autoritativo viene del endpoint.
 */
export const PLAN_WINDOW_TOKENS: Record<string, number> = {
  pro: 44_000,
  max_5x: 88_000,
  max_20x: 220_000,
};

export function ensureDirs(): void {
  mkdirSync(AMNIS_DIR, { recursive: true });
}
