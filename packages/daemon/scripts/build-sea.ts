// Empaqueta el daemon como binario autocontenido (Node SEA, #41) para que
// Tauri lo lance como sidecar sin depender del `node` del sistema.
//
//   node packages/daemon/scripts/build-sea.ts
//
// Tres pasos, en este orden:
//   1. esbuild → dist/amnis.cjs. Node 24 no acepta ESM como entrypoint de un
//      SEA (medido: `mainFormat: "module"` falla al cargar), así que el
//      daemon entero —con @amnis/shared dentro— se aplana a un solo CJS.
//   2. blob SEA + copia del `node` actual + inyección con postject.
//   3. recursos (web, dashboard, hook) junto al binario, con el layout que
//      espera `resolveResources()` en src/config.ts.
//
// En macOS el `node` copiado viene firmado: se le quita la firma antes de
// inyectar y se vuelve a firmar ad-hoc después (#130). Sin firma válida,
// Apple Silicon mata el proceso nada más arrancar.
//
// En Windows (#133) el binario lleva `.exe`: Tauri busca el sidecar con la
// extensión de la plataforma. El `node.exe` copiado viene firmado con
// Authenticode y la inyección invalida esa firma; arranca igual, sin firmar.
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { inject } = require("postject") as {
  inject: (
    file: string,
    resource: string,
    data: Buffer,
    options: { sentinelFuse: string; machoSegmentName?: string },
  ) => Promise<void>;
};

// Fijo en Node: es el marcador que el binario busca para saber si lleva blob.
const SENTINEL_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

const DAEMON_DIR = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = join(DAEMON_DIR, "..", "..");
const DIST_DIR = join(DAEMON_DIR, "dist");
const TAURI_DIR = join(REPO_ROOT, "apps", "pet", "src-tauri");
const WEB_DIST = join(REPO_ROOT, "apps", "web", "dist");

/** Tauri exige el triple de destino como sufijo del nombre del sidecar. */
function targetTriple(): string {
  if (process.env.TAURI_ENV_TARGET_TRIPLE) {
    return process.env.TAURI_ENV_TARGET_TRIPLE;
  }
  const out = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const host = /^host: (\S+)$/m.exec(out)?.[1];
  if (!host) throw new Error("No se pudo leer el triple de `rustc -vV`.");
  return host;
}

async function bundle(): Promise<string> {
  const outfile = join(DIST_DIR, "amnis.cjs");
  await build({
    entryPoints: [join(DAEMON_DIR, "src", "cli.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    // En CJS no existe import.meta: se reconstruye desde __filename para que
    // la rama "repo" de resolveResources() siga funcionando con
    // `node dist/amnis.cjs`. Dentro del SEA gana la rama del ejecutable.
    banner: {
      js: 'const __amnis_import_meta_url = require("node:url").pathToFileURL(__filename).href;',
    },
    define: { "import.meta.url": "__amnis_import_meta_url" },
    logLevel: "warning",
  });
  return outfile;
}

async function makeExecutable(main: string, output: string): Promise<void> {
  const configPath = join(DIST_DIR, "sea-config.json");
  const blobPath = join(DIST_DIR, "sea-prep.blob");
  writeFileSync(
    configPath,
    JSON.stringify({
      main,
      output: blobPath,
      disableExperimentalSEAWarning: true,
    }),
  );
  execFileSync(process.execPath, ["--experimental-sea-config", configPath], {
    stdio: "inherit",
  });

  const macos = process.platform === "darwin";
  mkdirSync(join(output, ".."), { recursive: true });
  copyFileSync(process.execPath, output);
  chmodSync(output, 0o755);
  if (macos) execFileSync("codesign", ["--remove-signature", output]);
  await inject(output, "NODE_SEA_BLOB", readFileSync(blobPath), {
    sentinelFuse: SENTINEL_FUSE,
    // Mach-O guarda el blob en un segmento propio; ELF y PE no lo necesitan.
    ...(macos && { machoSegmentName: "NODE_SEA" }),
  });
  if (macos) execFileSync("codesign", ["--sign", "-", output]);
}

function copyResources(dest: string): void {
  if (!existsSync(join(WEB_DIST, "index.html"))) {
    throw new Error(
      "Falta apps/web/dist. Ejecuta `pnpm --filter @amnis/web build` antes.",
    );
  }
  rmSync(dest, { recursive: true, force: true });
  cpSync(WEB_DIST, join(dest, "web"), { recursive: true });
  cpSync(join(DAEMON_DIR, "public"), join(dest, "public"), {
    recursive: true,
  });
  cpSync(join(DAEMON_DIR, "hooks"), join(dest, "hooks"), { recursive: true });
  cpSync(
    join(REPO_ROOT, ".claude", "skills", "amnis-skin"),
    join(dest, "skill", "amnis-skin"),
    { recursive: true },
  );
}

const main = await bundle();
const exe = process.platform === "win32" ? ".exe" : "";
const binary = join(
  TAURI_DIR,
  "binaries",
  `amnis-daemon-${targetTriple()}${exe}`,
);
await makeExecutable(main, binary);
copyResources(join(TAURI_DIR, "resources"));
console.log(`SEA listo: ${binary}`);
