import type { UpdateInfo } from "@amnis/shared";
import { isNewer, parseVersion } from "../domain/version.ts";

export interface CheckUpdateDeps {
  fetchLatest(): Promise<{ tag: string; url: string } | { error: string }>;
  currentVersion: string;
}

/**
 * Un tag ilegible es un error, no «no hay versión nueva»: así quien llama
 * conserva el último aviso bueno en vez de borrarlo.
 */
export async function checkUpdate(
  deps: CheckUpdateDeps,
): Promise<{ update: UpdateInfo | null } | { error: string }> {
  const release = await deps.fetchLatest();
  if ("error" in release) return release;
  const latest = parseVersion(release.tag);
  if (!latest) return { error: `Tag de release ilegible: ${release.tag}.` };
  const current = parseVersion(deps.currentVersion);
  if (!current) {
    return { error: `Versión instalada ilegible: ${deps.currentVersion}.` };
  }
  if (!isNewer(latest, current)) return { update: null };
  return { update: { version: latest.join("."), url: release.url } };
}
