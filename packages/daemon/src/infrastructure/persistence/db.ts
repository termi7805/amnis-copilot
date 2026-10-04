import { DatabaseSync } from "node:sqlite";
import { DB_PATH, ensureDirs } from "../../config.ts";
import { type Checkout, resolveCheckout } from "../git.ts";

/**
 * El uso (`usage_events`) sale de los JSONL, pero Claude Code los purga con el
 * tiempo: una vez purgados, la BD es la única copia. Por eso `amnis ingest
 * --rebuild` reingiere y corrige filas, nunca borra.
 *
 * Tampoco se reconstruyen `quota_samples` y `hook_events` (solo existen porque
 * el daemon estaba escuchando) ni `plan_window_tokens` (tarda días en
 * recalibrarse). Las migraciones añaden columnas, nunca borran y recrean.
 *
 * Solo metadatos: nunca prompts ni código.
 */
export function openDb(
  path: string = DB_PATH,
  resolve: (cwd: string) => Checkout = resolveCheckout,
): DatabaseSync {
  ensureDirs();
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  // `--rebuild` con el daemon vivo retiene el write lock unos segundos: el
  // daemon espera en vez de fallar con SQLITE_BUSY.
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db, resolve);
  return db;
}

function migrate(db: DatabaseSync, resolve: (cwd: string) => Checkout): void {
  db.exec(`
    -- Multi-cuenta desde el día uno aunque el MVP solo use una fila:
    -- es barato en el esquema y caro en el auth.
    CREATE TABLE IF NOT EXISTS accounts (
      id          INTEGER PRIMARY KEY,
      provider    TEXT NOT NULL,
      label       TEXT NOT NULL,
      plan        TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (provider, label)
    );

    -- Ingesta incremental: qué llevamos leído de cada JSONL.
    CREATE TABLE IF NOT EXISTS ingest_offsets (
      file_path   TEXT PRIMARY KEY,
      size        INTEGER NOT NULL,
      offset      INTEGER NOT NULL,
      updated_at  TEXT NOT NULL
    );

    -- Un evento por message.id.
    --
    -- OJO: varias líneas del JSONL comparten message.id y REPITEN el mismo
    -- objeto usage (una línea por bloque de contenido: thinking, tool_use,
    -- text). Deduplicar por uuid DOBLA los tokens. Por eso dedupe_key
    -- deriva de message.id y es UNIQUE.
    CREATE TABLE IF NOT EXISTS usage_events (
      id                     INTEGER PRIMARY KEY,
      account_id             INTEGER NOT NULL REFERENCES accounts(id),
      provider               TEXT NOT NULL,
      dedupe_key             TEXT NOT NULL UNIQUE,
      session_id             TEXT,
      project                TEXT,
      ts                     TEXT NOT NULL,
      model                  TEXT,
      input_tokens           INTEGER NOT NULL DEFAULT 0,
      output_tokens          INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens  INTEGER NOT NULL DEFAULT 0,
      cache_creation_1h_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens      INTEGER NOT NULL DEFAULT 0,
      service_tier           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_events (ts);
    CREATE INDEX IF NOT EXISTS idx_usage_project ON usage_events (project, ts);

    -- Evento crudo del hook + estado que produjo. Sin contenido de prompts.
    CREATE TABLE IF NOT EXISTS hook_events (
      id             INTEGER PRIMARY KEY,
      account_id     INTEGER NOT NULL REFERENCES accounts(id),
      provider       TEXT NOT NULL,
      ts             TEXT NOT NULL,
      hook           TEXT NOT NULL,
      tool_name      TEXT,
      session_id     TEXT,
      project        TEXT,
      derived_state  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hook_ts ON hook_events (ts);

    -- Serie temporal: el % del endpoint Y la estimación local del mismo
    -- instante. La divergencia entre ambos es dato en sí.
    CREATE TABLE IF NOT EXISTS quota_samples (
      id                    INTEGER PRIMARY KEY,
      account_id            INTEGER NOT NULL REFERENCES accounts(id),
      ts                    TEXT NOT NULL,
      five_hour_util        REAL,
      five_hour_resets_at   TEXT,
      seven_day_util        REAL,
      seven_day_resets_at   TEXT,
      opus_util             REAL,
      limits_json           TEXT,
      local_tokens          INTEGER NOT NULL,
      local_util            REAL NOT NULL,
      source                TEXT NOT NULL,
      error                 TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_quota_ts ON quota_samples (ts);

    -- Una fila por ventana de 5 h: tokens locales y % autoritativo de su última
    -- muestra válida. El techo del plan es la mediana de las últimas cerradas.
    -- Se filtra por plan: cambiar de plan descarta el historial.
    CREATE TABLE IF NOT EXISTS window_ceilings (
      account_id   INTEGER NOT NULL REFERENCES accounts(id),
      plan         TEXT NOT NULL,
      window_end   TEXT NOT NULL,
      tokens       INTEGER NOT NULL,
      utilization  REAL NOT NULL,
      PRIMARY KEY (account_id, window_end)
    );

    -- Última tabla de precios buena descargada (providers/anthropic/pricing.ts).
    -- No es derivada de los JSONL, pero sí reconstruible: se vuelve a
    -- descargar, y mientras tanto vale la semilla de domain/cost.ts.
    CREATE TABLE IF NOT EXISTS model_prices (
      model           TEXT PRIMARY KEY,
      input           REAL NOT NULL,
      output          REAL NOT NULL,
      cache_write_5m  REAL NOT NULL,
      cache_write_1h  REAL NOT NULL,
      cache_read      REAL NOT NULL,
      fetched_at      TEXT NOT NULL
    );
  `);

  // ALTER TABLE ADD COLUMN no es idempotente con IF NOT EXISTS en SQLite:
  // hay que comprobar antes. El techo calibrado (2.4) se persiste aquí,
  // no en el código — PLAN_WINDOW_TOKENS es solo el valor inicial.
  const accountColumns = db.prepare("PRAGMA table_info(accounts)").all() as {
    name: string;
  }[];
  if (!accountColumns.some((c) => c.name === "plan_window_tokens")) {
    db.exec("ALTER TABLE accounts ADD COLUMN plan_window_tokens INTEGER");
  }

  // quota_samples es la única tabla que no se reconstruye desde los JSONL:
  // la columna se añade sobre la tabla existente, nunca se recrea. `opus_util`
  // se queda por compatibilidad (las filas nuevas la dejan en NULL).
  const quotaColumns = db.prepare("PRAGMA table_info(quota_samples)").all() as {
    name: string;
  }[];
  if (!quotaColumns.some((c) => c.name === "limits_json")) {
    db.exec("ALTER TABLE quota_samples ADD COLUMN limits_json TEXT");
  }

  // La rama de git de cada sesión (#87). Las filas anteriores la rellenan al
  // pasar `amnis ingest --rebuild`, que actualiza en vez de borrar.
  const usageColumns = db.prepare("PRAGMA table_info(usage_events)").all() as {
    name: string;
  }[];
  if (!usageColumns.some((c) => c.name === "git_branch")) {
    db.exec("ALTER TABLE usage_events ADD COLUMN git_branch TEXT");
  }
  // Motivo de los hooks de sesión (#105): `source` de SessionStart, `reason`
  // de SessionEnd. hook_events no se reconstruye: la columna se añade.
  const hookColumns = db.prepare("PRAGMA table_info(hook_events)").all() as {
    name: string;
  }[];
  if (!hookColumns.some((c) => c.name === "session_reason")) {
    db.exec("ALTER TABLE hook_events ADD COLUMN session_reason TEXT");
  }
  // Tipo de las `Notification` (#113): sin él no se distingue un permiso del
  // aviso de inactividad. Las filas anteriores quedan en NULL.
  if (!hookColumns.some((c) => c.name === "notification_type")) {
    db.exec("ALTER TABLE hook_events ADD COLUMN notification_type TEXT");
  }
  // Repo y worktree de cada hook (#106). Se rellenan los eventos antiguos una
  // sola vez, al añadir las columnas, resolviendo cada `project` distinto. Un
  // worktree ya borrado no se puede resolver: `resolveCheckout` devuelve el
  // propio `cwd` en las dos claves y no se inventa nada.
  if (!hookColumns.some((c) => c.name === "repo_root")) {
    db.exec("BEGIN");
    try {
      db.exec("ALTER TABLE hook_events ADD COLUMN repo_root TEXT");
      db.exec("ALTER TABLE hook_events ADD COLUMN worktree TEXT");
      const projects = db
        .prepare(
          "SELECT DISTINCT project FROM hook_events WHERE project IS NOT NULL",
        )
        .all() as { project: string }[];
      const fill = db.prepare(
        "UPDATE hook_events SET repo_root = ?, worktree = ? WHERE project = ?",
      );
      for (const { project } of projects) {
        const { repoRoot, worktree } = resolve(project);
        fill.run(repoRoot, worktree, project);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hook_repo ON hook_events (account_id, repo_root, ts);
    CREATE INDEX IF NOT EXISTS idx_hook_worktree ON hook_events (account_id, worktree, ts);
    CREATE INDEX IF NOT EXISTS idx_hook_session ON hook_events (account_id, session_id, ts);
  `);
  // Parte de 1 h de las escrituras de caché (#73). Las filas anteriores
  // quedan en 0 (= todo a 5 min) hasta `amnis ingest --rebuild`.
  if (!usageColumns.some((c) => c.name === "cache_creation_1h_tokens")) {
    db.exec(
      "ALTER TABLE usage_events ADD COLUMN cache_creation_1h_tokens INTEGER NOT NULL DEFAULT 0",
    );
  }
}
