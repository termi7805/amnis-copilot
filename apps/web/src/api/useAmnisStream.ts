import type { PetSnapshot, QuotaSnapshot, StateResponse } from "@amnis/shared";
import { useEffect, useState } from "react";
import { daemonUrl } from "./config.ts";

export interface AmnisStream {
  state: StateResponse | null;
  connected: boolean;
}

/**
 * GET /api/events por SSE (docs/STACK.md §4): `hello` trae el
 * StateResponse completo al conectar, `state`/`quota` solo sustituyen su
 * parte — nunca se pierde lo que el otro evento ya trajo.
 */
export function useAmnisStream(): AmnisStream {
  const [state, setState] = useState<StateResponse | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(`${daemonUrl()}/api/events`);

    source.addEventListener("hello", (e: MessageEvent<string>) => {
      setState(JSON.parse(e.data) as StateResponse);
      setConnected(true);
    });

    source.addEventListener("state", (e: MessageEvent<string>) => {
      const pet = JSON.parse(e.data) as PetSnapshot;
      setState((current) => (current ? { ...current, pet } : current));
    });

    source.addEventListener("quota", (e: MessageEvent<string>) => {
      const quotas = JSON.parse(e.data) as QuotaSnapshot[];
      setState((current) => (current ? { ...current, quotas } : current));
    });

    source.onerror = () => setConnected(false);

    return () => source.close();
  }, []);

  return { state, connected };
}
