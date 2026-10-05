import type { ClaudeSkillStatus } from "@amnis/shared";
import { type ActionResult, postAction } from "./actions.ts";
import { daemonUrl } from "./config.ts";

export async function fetchSkillStatus(): Promise<ClaudeSkillStatus> {
  const response = await fetch(`${daemonUrl()}/api/skill`);
  if (!response.ok) throw new Error(`GET /api/skill → ${response.status}`);
  return response.json();
}

/** Copia la skill `amnis-skin` a `~/.claude/skills/` (o la actualiza). */
export function installSkill(): Promise<ActionResult<ClaudeSkillStatus>> {
  return postAction<ClaudeSkillStatus>("/api/skill/install");
}
