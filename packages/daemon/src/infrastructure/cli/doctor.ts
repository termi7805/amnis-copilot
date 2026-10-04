import { formatMessage } from "@amnis/shared";
import { type Check, diagnose } from "../../application/diagnose.ts";
import { PORT } from "../../config.ts";
import { gatherDiagnoseFacts } from "../doctorFacts.ts";
import { anthropicProvider } from "../providers/anthropic/index.ts";

/** Cualquier respuesta HTTP prueba que el daemon está vivo; solo el
 * rechazo de red significa caído. Evita depender de una ruta concreta que
 * #26 va a redefinir. */
async function probeDaemon(): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${PORT}/`, {
      signal: AbortSignal.timeout(500),
    });
    return true;
  } catch {
    return false;
  }
}

function printCheck(check: Check): void {
  const mark = check.ok ? "✓" : "✗";
  // El CLI sigue en español: el idioma elegido es el de la interfaz web.
  console.log(`${mark} ${check.name}: ${formatMessage("es", check.message)}`);
  if (!check.ok && check.remedy) {
    console.log(`  → ${formatMessage("es", check.remedy)}`);
  }
}

export async function runDoctorCli(): Promise<void> {
  const now = new Date();
  const facts = await gatherDiagnoseFacts(
    {
      daemonAlive: probeDaemon,
      quotaError: async () => (await anthropicProvider.pollQuota()).error,
    },
    now,
  );
  const checks = diagnose(facts, now);

  for (const check of checks) printCheck(check);

  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}
