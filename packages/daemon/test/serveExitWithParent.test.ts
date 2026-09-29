import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

test("serve --exit-with-parent se cierra cuando se cierra su stdin", async () => {
  const dir = mkdtempSync(join(tmpdir(), "amnis-exit-parent-"));
  const child = spawn("node", [CLI, "serve", "--exit-with-parent"], {
    env: {
      ...process.env,
      AMNIS_DIR: join(dir, "amnis"),
      CLAUDE_CONFIG_DIR: join(dir, "claude"),
      AMNIS_PORT: "0",
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  try {
    // Esperar a que escuche: cerrar stdin antes probaría otra cosa.
    for await (const chunk of child.stdout) {
      if (String(chunk).includes("escuchando")) break;
    }
    child.stdin.end();
    const [code] = await once(child, "exit", {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(code, 0);
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
