import { DatabaseSync } from "node:sqlite";
import { DB_PATH, ensureDirs } from "../../config.ts";

/**
 * SQLite es una CACHÉ DERIVADA, no la fuente de verdad: los JSONL lo son.
 * Si cambia el parseo, se borra el fichero y se reingiere todo. Nada se pierde.
 *
 * Solo metadatos: nunca prompts ni código.
 */
export function openDb(path: string = DB_PATH): DatabaseSync {
  ensureDirs();
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
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
}
