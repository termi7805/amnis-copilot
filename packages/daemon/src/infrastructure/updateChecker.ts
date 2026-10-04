import type { UpdateInfo } from "@amnis/shared";

export interface UpdateCheckerDeps {
  check(): Promise<{ update: UpdateInfo | null } | { error: string }>;
  /** `settings.checkUpdates`, leído en cada pasada. */
  enabled(): boolean;
  onChange(update: UpdateInfo | null): void;
}

/**
 * El aviso de versión nueva en memoria (#148). Apagado no sale ninguna
 * petición; un fallo conserva el último aviso bueno, porque un 403 de
 * GitHub no significa que la versión nueva haya dejado de existir.
 */
export function createUpdateChecker(deps: UpdateCheckerDeps): {
  refresh(): Promise<{ error: string | null }>;
  current(): UpdateInfo | null;
} {
  let update: UpdateInfo | null = null;

  const set = (next: UpdateInfo | null) => {
    if (JSON.stringify(next) === JSON.stringify(update)) return;
    update = next;
    deps.onChange(next);
  };

  return {
    async refresh() {
      if (!deps.enabled()) {
        set(null);
        return { error: null };
      }
      const result = await deps.check();
      if ("error" in result) return { error: result.error };
      // Lo pudieron apagar mientras la petición estaba en vuelo.
      set(deps.enabled() ? result.update : null);
      return { error: null };
    },
    current: () => update,
  };
}
