import { existsSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { checkSkin } from "../../application/skins.ts";
import { skinFolder } from "../skinFiles.ts";

function check(args: readonly string[]): void {
  const [given] = args;
  if (!given) {
    console.error("Uso: amnis skin check <carpeta>");
    process.exitCode = 1;
    return;
  }
  const dir = resolve(given);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`✗ ${dir} no es una carpeta.`);
    process.exitCode = 1;
    return;
  }

  const { manifest, errors, warnings } = checkSkin(skinFolder(dir));
  for (const e of errors) console.log(`✗ ${e}`);
  for (const w of warnings) console.log(`⚠ ${w}`);
  if (errors.length > 0) {
    process.exitCode = 1;
    return;
  }
  const states = Object.keys(manifest?.states ?? {});
  console.log(
    `✓ ${manifest?.name ?? basename(dir)}: ${states.length} estados (${states.join(", ")})`,
  );
}

export function runSkinCli(args: readonly string[]): void {
  const [sub, ...rest] = args;
  if (sub === "check") {
    check(rest);
    return;
  }
  console.error(
    `Subcomando desconocido: ${sub ?? "(ninguno)"}. Usa: amnis skin check <carpeta>`,
  );
  process.exitCode = 1;
}
