export type IngestOutcome = "fresh" | "skipped-rebuild" | "failed";

export interface IngestRun {
  /** Cuándo terminó la última pasada. */
  at: Date;
  /** `null` si salió bien. */
  error: string | null;
}

export interface IngestRunner {
  /**
   * Deja la caché de uso al día antes de una muestra de cuota. **Nunca
   * rechaza**: un fallo de ingesta no puede tumbar el muestreo, solo evitar
   * que esa muestra calibre el techo (`"failed"`).
   */
  ensureFresh(): Promise<IngestOutcome>;
  /** Reconstruye la caché; rechaza con el motivo si el proceso falla. */
  rebuild(): Promise<void>;
  /** La última pasada terminada, automática o reconstrucción. */
  lastRun(): IngestRun | null;
}

export interface IngestRunnerDeps {
  spawn(options: { rebuild: boolean }): Promise<void>;
  /** Una pasada correcta más reciente que esto se da por buena sin lanzar otra. */
  maxAgeMs?: number;
  now?: () => Date;
}

/** `GET /api/state` también muestrea en vivo: con muestras a segundos de
 * distancia no se lanza un proceso por petición. */
const DEFAULT_MAX_AGE_MS = 30_000;

/**
 * Un solo proceso de ingesta a la vez en el daemon (#98), compartido por la
 * pasada automática de antes de cada muestra y por la reconstrucción. Si hay
 * una reconstrucción en curso, la automática no se lanza: la reconstrucción ya
 * lo lee todo.
 */
export function createIngestRunner(deps: IngestRunnerDeps): IngestRunner {
  const maxAgeMs = deps.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = deps.now ?? (() => new Date());
  let auto: Promise<IngestOutcome> | null = null;
  let rebuilding = false;
  let last: IngestRun | null = null;

  function finish(error: unknown): void {
    last = {
      at: now(),
      error:
        error === null
          ? null
          : error instanceof Error
            ? error.message
            : String(error),
    };
  }

  return {
    ensureFresh() {
      if (rebuilding) return Promise.resolve("skipped-rebuild");
      if (auto) return auto;
      if (
        last?.error === null &&
        now().getTime() - last.at.getTime() < maxAgeMs
      ) {
        return Promise.resolve("fresh");
      }
      const run: Promise<IngestOutcome> = deps
        .spawn({ rebuild: false })
        .then(
          (): IngestOutcome => {
            finish(null);
            return "fresh";
          },
          (err: unknown): IngestOutcome => {
            finish(err);
            return "failed";
          },
        )
        .finally(() => {
          auto = null;
        });
      auto = run;
      return run;
    },

    async rebuild() {
      // Se marca ya, antes de esperar: así una muestra que llegue mientras
      // tanto no lanza una ingesta automática encima.
      rebuilding = true;
      try {
        await auto;
        try {
          await deps.spawn({ rebuild: true });
        } catch (err) {
          finish(err);
          throw err;
        }
        finish(null);
      } finally {
        rebuilding = false;
      }
    },

    lastRun: () => last,
  };
}
