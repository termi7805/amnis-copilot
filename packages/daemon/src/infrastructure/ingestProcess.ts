import { spawn } from "node:child_process";
import { isSea } from "node:sea";

export interface IngestCommand {
  command: string;
  args: string[];
}

/**
 * El mismo binario con `ingest [--rebuild]`: el CLI y la ruta HTTP corren
 * exactamente el mismo código. Un hilo worker no serviría: el binario SEA es
 * un bundle de un solo fichero y no hay script al que apuntar. En SEA no hay
 * script (`argv[1]` ya es el primer argumento del usuario); con `node`, sí.
 */
export function ingestCommand(opts: {
  /** `true`: `ingest --rebuild`; `false`: la pasada incremental (`ingest`). */
  rebuild: boolean;
  sea: boolean;
  execPath: string;
  execArgv: readonly string[];
  script: string | undefined;
}): IngestCommand {
  const tail = opts.rebuild ? ["ingest", "--rebuild"] : ["ingest"];
  if (opts.sea || opts.script === undefined) {
    return { command: opts.execPath, args: tail };
  }
  return {
    command: opts.execPath,
    args: [...opts.execArgv, opts.script, ...tail],
  };
}

/**
 * Lo que se enseña de un proceso hijo que falló: la última línea `...Error: …`
 * del stderr (el motivo), no el árbol de llamadas entero que ensuciaría la
 * salud y el aviso del dashboard. Sin ella, la última línea no vacía.
 */
export function summarizeStderr(stderr: string): string {
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const reason = [...lines]
    .reverse()
    .find((line) => /^(?:[A-Za-z]+)?Error\b.*?: /.test(line));
  return reason ?? lines.at(-1) ?? "";
}

/** Cuánto stderr se guarda para el mensaje de error. */
const STDERR_TAIL_BYTES = 2000;

/**
 * Ingiere (o reconstruye, con `rebuild`) la caché de uso en un proceso aparte
 * (#90, #98): leer los JSONL son segundos de CPU síncrona tras horas sin
 * ingerir (~20 ms/MB), y en el daemon congelarían el bucle de eventos (y con
 * él el panel de la mascota y el `200` de los hooks). Hereda el entorno
 * (`AMNIS_DIR`, `CLAUDE_CONFIG_DIR`). Resuelve si sale con 0; si no, rechaza
 * con el final de su stderr.
 */
export function spawnIngest(options: { rebuild: boolean }): Promise<void> {
  const { command, args } = ingestCommand({
    rebuild: options.rebuild,
    sea: isSea(),
    execPath: process.execPath,
    execArgv: process.execArgv,
    script: process.argv[1],
  });
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      // node.exe es una app de consola: sin esto, cada ingesta lanzada desde
      // el sidecar de Windows abre una ventana de cmd (#133).
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL_BYTES);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            summarizeStderr(stderr) || `La ingesta terminó con código ${code}.`,
          ),
        );
      }
    });
  });
}
