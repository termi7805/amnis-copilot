import {
  type AmnisSettings,
  type MediaSnapshot,
  type PetSnapshot,
  type QuotaSnapshot,
  type RebuildEvent,
  resolvePlan,
  type StateResponse,
} from "@amnis/shared";
import { useEffect, useState } from "react";
import { daemonUrl } from "./config.ts";
import { useRefreshMediaOnFocus } from "./media.ts";

/**
 * `EventSource` ya reconecta solo; lo único que hace falta escribir es
 * distinguir dos caídas que se ven igual desde fuera: un corte que se
 * resuelve solo (`reconnecting`) de un daemon de verdad caído
 * (`offline`). Un simple booleano las confunde y la mascota no puede
 * decir "no veo nada" a tiempo (docs/DESIGN.md §4).
 */
export type ConnectionStatus = "connected" | "reconnecting" | "offline";

/** Antes de este umbral, un error es solo ruido de red. */
const OFFLINE_AFTER_MS = 5_000;

export interface AmnisStream {
  state: StateResponse | null;
  status: ConnectionStatus;
  /** Fin de la última reconstrucción de caché; `seq` distingue dos seguidas. */
  rebuild: { seq: number; event: RebuildEvent } | null;
  /** El dashboard pidió «Cerrar Amnis»: la ventana de la mascota cierra la app. */
  quitRequested: boolean;
}

/**
 * GET /api/events por SSE (docs/STACK.md §4): `hello` trae el
 * StateResponse completo al conectar, `state`/`quota`/`media`/`settings` solo
 * sustituyen su parte — nunca se pierde lo que otro evento ya trajo.
 */
export function useAmnisStream(): AmnisStream {
  useRefreshMediaOnFocus();
  const [state, setState] = useState<StateResponse | null>(null);
  // Arranca en "reconnecting": antes del primer `onopen` no se ha
  // alcanzado al daemon todavía, y "connected" sería inventárselo.
  const [status, setStatus] = useState<ConnectionStatus>("reconnecting");
  const [rebuild, setRebuild] = useState<AmnisStream["rebuild"]>(null);
  const [quitRequested, setQuitRequested] = useState(false);

  useEffect(() => {
    const source = new EventSource(`${daemonUrl()}/api/events`);
    let offlineTimer: ReturnType<typeof setTimeout> | null = null;

    source.addEventListener("hello", (e: MessageEvent<string>) => {
      setState(JSON.parse(e.data) as StateResponse);
    });

    source.addEventListener("state", (e: MessageEvent<string>) => {
      const pet = JSON.parse(e.data) as PetSnapshot;
      setState((current) => (current ? { ...current, pet } : current));
    });

    source.addEventListener("quota", (e: MessageEvent<string>) => {
      const quotas = JSON.parse(e.data) as QuotaSnapshot[];
      setState((current) => (current ? { ...current, quotas } : current));
    });

    source.addEventListener("media", (e: MessageEvent<string>) => {
      const media = JSON.parse(e.data) as MediaSnapshot;
      setState((current) => (current ? { ...current, media } : current));
    });

    // Las preferencias de la capa de música viven en el daemon: un cambio
    // hecho en el dashboard llega aquí y se aplica en vivo (#65).
    source.addEventListener("settings", (e: MessageEvent<string>) => {
      const settings = JSON.parse(e.data) as AmnisSettings;
      setState((current) =>
        current
          ? {
              ...current,
              settings,
              // `settings` solo trae el plan manual: lo detectado gana siempre
              // y no cambia con este evento; lo manual sí.
              plan:
                current.plan?.source === "detected"
                  ? current.plan
                  : resolvePlan(null, settings.plan),
            }
          : current,
      );
    });

    // La reconstrucción de caché responde 202 y termina aquí (#90).
    source.addEventListener("rebuild", (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as RebuildEvent;
      setRebuild((prev) => ({ seq: (prev?.seq ?? 0) + 1, event }));
    });

    source.addEventListener("quit", () => setQuitRequested(true));

    source.onopen = () => {
      if (offlineTimer) {
        clearTimeout(offlineTimer);
        offlineTimer = null;
      }
      setStatus("connected");
    };

    source.onerror = () => {
      setStatus("reconnecting");
      // Ya hay uno corriendo: una ráfaga de errores durante un corte
      // largo no debe aplazar el `offline` indefinidamente.
      if (!offlineTimer) {
        offlineTimer = setTimeout(() => setStatus("offline"), OFFLINE_AFTER_MS);
      }
    };

    return () => {
      if (offlineTimer) clearTimeout(offlineTimer);
      source.close();
    };
  }, []);

  return { state, status, rebuild, quitRequested };
}
