import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { isSea } from "node:sea";
import { fileURLToPath } from "node:url";

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

/** Ficheros que el daemon sirve o instala, fuera del propio código. */
export interface Resources {
  webDist: string;
  dashboardHtml: string;
  hookScript: string;
}

/**
 * De dónde salen los ficheros del daemon (#41). Tres modos, en este orden:
 * `AMNIS_RESOURCES_DIR` explícito (Tauri lo pasa al sidecar), junto al
 * ejecutable si corre como binario SEA, o el repo si corre con `node`.
 * Los dos primeros comparten layout (`web/`, `public/`, `hooks/`), que es
 * lo que `build-sea.ts` copia; el repo conserva sus rutas de siempre.
 */
export function resolveResources(opts: {
  resourcesDir: string | undefined;
  sea: boolean;
  execPath: string;
  repoRoot: string;
}): Resources {
  const bundled =
    opts.resourcesDir ??
    (opts.sea ? join(dirname(opts.execPath), "resources") : undefined);
  if (bundled !== undefined) {
    return {
      webDist: join(bundled, "web"),
      dashboardHtml: join(bundled, "public", "index.html"),
      hookScript: join(bundled, "hooks", "amnis-hook.sh"),
    };
  }
  return {
    webDist: join(opts.repoRoot, "apps", "web", "dist"),
    dashboardHtml: join(
      opts.repoRoot,
      "packages",
      "daemon",
      "public",
      "index.html",
    ),
    hookScript: join(
      opts.repoRoot,
      "packages",
      "daemon",
      "hooks",
      "amnis-hook.sh",
    ),
  };
}

export const RESOURCES = resolveResources({
  resourcesDir: process.env.AMNIS_RESOURCES_DIR,
  sea: isSea(),
  execPath: process.execPath,
  // src/config.ts y dist/amnis.cjs están a la misma profundidad.
  repoRoot: fileURLToPath(new URL("../../../", import.meta.url)),
});

/** Donde install-hooks copia el script: estable aunque el binario se mueva
 * (una AppImage monta sus recursos en una ruta distinta en cada arranque). */
export const INSTALLED_HOOK_SCRIPT = join(AMNIS_DIR, "hooks", "amnis-hook.sh");

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
