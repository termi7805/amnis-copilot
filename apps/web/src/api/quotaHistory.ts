import type { QuotaHistoryResponse, QuotaPeak } from "@amnis/shared";
import { useEffect, useState } from "react";
import { daemonUrl } from "./config.ts";

export async function fetchQuotaHistory(
  from: Date,
  to: Date,
): Promise<QuotaHistoryResponse> {
  const query = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const response = await fetch(`${daemonUrl()}/api/quota/history?${query}`);
  if (!response.ok) {
    throw new Error(`GET /api/quota/history → ${response.status}`);
  }
  return response.json();
}

export async function fetchQuotaPeaks(
  from: Date,
  to: Date,
): Promise<QuotaPeak[]> {
  const query = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const response = await fetch(`${daemonUrl()}/api/quota/peaks?${query}`);
  if (!response.ok) {
    throw new Error(`GET /api/quota/peaks → ${response.status}`);
  }
  return response.json();
}

/**
 * Muestras de `[from, ahora]`. `refreshKey` (el `sampledAt` del último
 * sondeo) vuelve a pedirlas: la sparkline avanza con cada sondeo del daemon
 * sin un temporizador propio. Un fallo deja la serie anterior: es solo adorno.
 */
export function useQuotaHistory(
  from: Date,
  refreshKey: string,
): QuotaHistoryResponse["samples"] {
  const [samples, setSamples] = useState<QuotaHistoryResponse["samples"]>([]);
  const fromMs = from.getTime();

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey solo dispara el refetch
  useEffect(() => {
    let cancelled = false;
    fetchQuotaHistory(new Date(fromMs), new Date())
      .then((r) => {
        if (!cancelled) setSamples(r.samples);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fromMs, refreshKey]);

  return samples;
}
