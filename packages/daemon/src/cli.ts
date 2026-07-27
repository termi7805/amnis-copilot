#!/usr/bin/env node
import { VERSION } from "./config.ts";
import { runDoctorCli } from "./infrastructure/cli/doctor.ts";
import { runIngestCli } from "./infrastructure/cli/ingest.ts";
import { runInstallHooksCli } from "./infrastructure/cli/installHooks.ts";
import { runServeCli } from "./infrastructure/cli/serve.ts";
import { runUninstallHooksCli } from "./infrastructure/cli/uninstallHooks.ts";

const HELP = `amnis <comando>

Comandos:
  ingest [--rebuild]   Ingesta incremental de los transcripts de uso.
                        --rebuild borra la BD y reingiere todo desde cero.
  install-hooks         Registra los hooks de Amnis en ~/.claude/settings.json
                        (merge no destructivo; reinstalar reemplaza en su sitio).
  uninstall-hooks        Quita los hooks de Amnis de ~/.claude/settings.json,
                        dejándolo equivalente al original.
  serve                  Arranca el daemon: BD, rutas HTTP y poller de cuota.
  doctor                 Diagnostica daemon, hooks, credenciales, endpoint,
                        BD e ingesta, con el remedio de cada fallo.
  --help                Muestra esta ayuda.
  --version             Muestra la versión.
`;

async function main(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;

  switch (command) {
    case "ingest":
      runIngestCli(rest);
      return;
    case "install-hooks":
      runInstallHooksCli();
      return;
    case "uninstall-hooks":
      runUninstallHooksCli();
      return;
    case "serve":
      runServeCli();
      return;
    case "doctor":
      await runDoctorCli();
      return;
    case "--version":
      console.log(VERSION);
      return;
    case "--help":
    case undefined:
      console.log(HELP);
      return;
    default:
      console.error(`Comando desconocido: ${command}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main(process.argv.slice(2));
