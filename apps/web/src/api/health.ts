import type { HealthResponse, RepairHooksResponse } from "@amnis/shared";
import { useCallback, useEffect, useState } from "react";
import { type ActionResult, postAction } from "./actions.ts";
import { daemonUrl } from "./config.ts";
import { sendMediaCommand } from "./media.ts";

/** Cuánto tarda en repetirse el chequeo si nada lo dispara antes. */
export const HEALTH_POLL_MS = 60_000;

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${daemonUrl()}/api/health`);
  if (!response.ok) {
    throw new Error(`GET /api/health → ${response.status}`);
  }
  return response.json();
}

export interface HealthState {
  health: HealthResponse | null;
  /** El último intento falló: el daemon no contestó. Lo anterior se conserva. */
  unreachable: boolean;
  refresh(): void;
}

/**
 * La salud del sistema, la misma que `amnis doctor`. Se vuelve a pedir cada
 * minuto, al recuperar el foco y cada vez que cambia `refreshKey` (el sondeo de
 * cuota: así un error del endpoint llega al raíl sin esperar al minuto). Vive en
 * el esqueleto y no en Ajustes porque el aviso del raíl se ve en todas las
 * vistas.
 */
export function useHealth(refreshKey: string): HealthState {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey y tick solo disparan el refetch
  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then((r) => {
        if (cancelled) return;
        setHealth(r);
        setUnreachable(false);
      })
      .catch(() => {
        if (!cancelled) setUnreachable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, tick]);

  useEffect(() => {
    const id = setInterval(refresh, HEALTH_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { health, unreachable, refresh };
}

/** Cuántos chequeos fallan: lo que cuenta la insignia del raíl. */
export function countWarnings(health: HealthResponse | null): number {
  return health?.checks.filter((c) => !c.ok).length ?? 0;
}

export function repairHooks(): Promise<ActionResult<RepairHooksResponse>> {
  return postAction<RepairHooksResponse>("/api/hooks/install");
}

/** 202: el fin llega por el evento SSE `rebuild`, no en esta respuesta. */
export function rebuildCache(): Promise<ActionResult> {
  return postAction("/api/ingest/rebuild");
}

export function disconnectSpotify(): Promise<ActionResult> {
  return postAction("/api/spotify/logout");
}

/** Abre el login de Spotify en el navegador; el daemon ya sabe cómo. */
export async function connectSpotify(): Promise<ActionResult> {
  const result = await sendMediaCommand("connect");
  return result.ok
    ? { ok: true, body: {} }
    : {
        ok: false,
        message: result.remedy
          ? `${result.message} ${result.remedy}`
          : result.message,
      };
}
