#!/usr/bin/env node
import { VERSION } from "./config.ts";
import { runIngestCli } from "./infrastructure/cli/ingest.ts";

const HELP = `amnis <comando>

Comandos:
  ingest [--rebuild]   Ingesta incremental de los transcripts de uso.
                        --rebuild borra la BD y reingiere todo desde cero.
  --help                Muestra esta ayuda.
  --version             Muestra la versión.
`;

function main(argv: readonly string[]): void {
  const [command, ...rest] = argv;

  switch (command) {
    case "ingest":
      runIngestCli(rest);
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
