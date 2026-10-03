import type { ActivityHeatmapResponse, ActivityResponse } from "@amnis/shared";
import { useEffect, useState } from "react";
import { daemonUrl } from "./config.ts";

/** `day` en `YYYY-MM-DD`; sin él, el daemon usa hoy en su hora local. */
export async function fetchActivity(day?: string): Promise<ActivityResponse> {
  const query = day ? `?${new URLSearchParams({ day })}` : "";
  const response = await fetch(`${daemonUrl()}/api/activity${query}`);
  if (!response.ok) {
    throw new Error(`GET /api/activity → ${response.status}`);
  }
  return response.json();
}

export async function fetchHeatmap(
  weeks = 4,
): Promise<ActivityHeatmapResponse> {
  const response = await fetch(
    `${daemonUrl()}/api/activity/heatmap?weeks=${weeks}`,
  );
  if (!response.ok) {
    throw new Error(`GET /api/activity/heatmap → ${response.status}`);
  }
  return response.json();
}

/**
 * La actividad de hoy. `refreshKey` vuelve a pedirla: la vista lo cambia con
 * cada transición de estado de Amnis (llega por SSE), así "Te esperó" sube al
 * aceptar un permiso sin un temporizador propio. Un fallo deja lo anterior.
 */
export function useTodayActivity(refreshKey: string): ActivityResponse | null {
  const [activity, setActivity] = useState<ActivityResponse | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey solo dispara el refetch
  useEffect(() => {
    let cancelled = false;
    fetchActivity()
      .then((r) => {
        if (!cancelled) setActivity(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return activity;
}
