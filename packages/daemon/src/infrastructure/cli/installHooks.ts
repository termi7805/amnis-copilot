import { repairHooks } from "../../application/installHooks.ts";
import { CLAUDE_SETTINGS } from "../../config.ts";
import { makeRepairHooksDeps } from "../claudeSettings.ts";

export function runInstallHooksCli(): void {
  const { added, backup } = repairHooks(makeRepairHooksDeps());

  if (backup) console.log(`Respaldo: ${backup}`);
  console.log(
    `Hooks instalados en ${CLAUDE_SETTINGS}: PreToolUse, Notification, Stop.`,
  );
  if (added.length > 0) console.log(`Añadidos: ${added.join(", ")}.`);
}
