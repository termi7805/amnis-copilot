import { spawn } from "node:child_process";
import { isSea } from "node:sea";

export interface RebuildCommand {
  command: string;
  args: string[];
}

/**
 * El mismo binario con `ingest --rebuild`: el CLI y la ruta HTTP corren
 * exactamente el mismo código. Un hilo worker no serviría: el binario SEA es
 * un bundle de un solo fichero y no hay script al que apuntar. En SEA no hay
 * script (`argv[1]` ya es el primer argumento del usuario); con `node`, sí.
 */
export function rebuildCommand(opts: {
  sea: boolean;
  execPath: string;
  execArgv: readonly string[];
  script: string | undefined;
}): RebuildCommand {
  const tail = ["ingest", "--rebuild"];
  if (opts.sea || opts.script === undefined) {
    return { command: opts.execPath, args: tail };
  }
  return {
    command: opts.execPath,
    args: [...opts.execArgv, opts.script, ...tail],
  };
}

/** Cuánto stderr se guarda para el mensaje de error. */
const STDERR_TAIL_BYTES = 2000;

/**
 * Reconstruye la caché de uso en un proceso aparte (#90): leer 850 MB de JSONL
 * son segundos de CPU síncrona, y en el daemon congelarían el bucle de
 * eventos (y con él el panel de la mascota). Hereda el entorno (`AMNIS_DIR`,
 * `CLAUDE_CONFIG_DIR`). Resuelve si sale con 0; si no, rechaza con el final
 * de su stderr.
 */
export function spawnRebuild(): Promise<void> {
  const { command, args } = rebuildCommand({
    sea: isSea(),
    execPath: process.execPath,
    execArgv: process.execArgv,
    script: process.argv[1],
  });
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
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
            stderr.trim() || `La reconstrucción terminó con código ${code}.`,
          ),
        );
      }
    });
  });
}
