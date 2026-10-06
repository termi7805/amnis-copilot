import type { SessionPet } from "@amnis/shared";

/**
 * Qué sesión tiene delante este cliente. Por `sessionId` y no por índice: con
 * un índice, cualquier sesión que termine por delante cambiaría de mascota sin
 * tocar nada. El índice solo sirve para saber qué puesto ocupaba si sale.
 */
export type CarouselPick = { sessionId: string; index: number } | null;

export interface Resolved {
  session: SessionPet;
  index: number;
}

/**
 * La sesión que se ve. Si la elegida sigue viva, esa; si salió, la que ocupa
 * ahora su puesto (o la última), nunca la primera; sin elección, la primera.
 * Una sesión nueva entra al final (`sessions` va en orden de llegada), así que
 * no mueve nada.
 */
export function resolvePick(
  sessions: SessionPet[],
  pick: CarouselPick,
): Resolved | null {
  const at = (index: number): Resolved | null => {
    const session = sessions[index];
    return session ? { session, index } : null;
  };
  if (!pick) return at(0);
  const index = sessions.findIndex((s) => s.sessionId === pick.sessionId);
  if (index !== -1) return at(index);
  return at(Math.min(pick.index, sessions.length - 1));
}

/** Un paso a un lado, con vuelta: → en la última lleva a la primera. */
export function stepPick(
  sessions: SessionPet[],
  current: Resolved | null,
  dir: 1 | -1,
): CarouselPick {
  const from = current?.index ?? 0;
  const index = (from + dir + sessions.length) % sessions.length;
  const session = sessions[index];
  return session ? { sessionId: session.sessionId, index } : null;
}
