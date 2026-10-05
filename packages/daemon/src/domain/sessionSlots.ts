import { sessionAlive } from "./petState.ts";

/** Tamaño de la paleta de identidad; la de la mascota tiene tantos colores. */
export const IDENTITY_COLORS = 6;

export interface SessionSlot {
  sessionId: string;
  worktree: string;
  /** `startedAt` del primer linaje que ocupó el puesto: lo que ordena. */
  rank: string;
  identity: number;
}

export interface SlotCandidate {
  sessionId: string;
  worktree: string | null;
  startedAt: string;
  lastEventAt: string;
  ended: boolean;
  /** Empezó con un `SessionStart` de `/clear`. */
  startedByClear: boolean;
  /** Su último `SessionEnd` fue un `/clear`. */
  clearedEnd: boolean;
}

/**
 * Puestos y colores de las sesiones vivas a partir de los del instante anterior.
 * Una sesión conserva puesto y color mientras viva; la nueva toma el primer
 * color libre. El puesto de una sesión que acaba de hacer `/clear` se reserva:
 * la conversación nueva no aparece hasta su primer hook de actividad, y si el
 * puesto se soltara en el `SessionEnd` no tendría nada que heredar.
 */
export function assignSlots(
  candidates: readonly SlotCandidate[],
  previous: readonly SessionSlot[],
  now: Date,
): SessionSlot[] {
  const prev = new Map(previous.map((s) => [s.sessionId, s]));
  const kept: SessionSlot[] = [];
  const reserved: SessionSlot[] = [];
  const fresh: SlotCandidate[] = [];

  for (const c of candidates) {
    if (!c.worktree) continue;
    const alive = sessionAlive(c.ended, new Date(c.lastEventAt), now);
    const slot = prev.get(c.sessionId);
    if (alive) {
      if (slot) kept.push({ ...slot, worktree: c.worktree });
      else fresh.push(c);
    } else if (slot && c.ended && c.clearedEnd) {
      const idle = now.getTime() - new Date(c.lastEventAt).getTime();
      if (idle < RESERVE_MS) reserved.push(slot);
    }
  }

  const slots = [...kept];
  const inherited = new Set<string>();
  const used = (): Set<number> =>
    new Set(slots.concat(reserved).map((s) => s.identity));

  fresh.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const c of fresh) {
    const heir = c.startedByClear
      ? reserved.find(
          (r) => r.worktree === c.worktree && !inherited.has(r.sessionId),
        )
      : undefined;
    if (heir) {
      inherited.add(heir.sessionId);
      slots.push({
        sessionId: c.sessionId,
        worktree: heir.worktree,
        rank: heir.rank,
        identity: heir.identity,
      });
    } else {
      slots.push({
        sessionId: c.sessionId,
        worktree: c.worktree as string,
        rank: c.startedAt,
        identity: freeIdentity(used(), slots),
      });
    }
  }

  const stillReserved = reserved.filter((r) => !inherited.has(r.sessionId));
  return [...slots, ...stillReserved].sort(
    (a, b) =>
      a.rank.localeCompare(b.rank) || a.sessionId.localeCompare(b.sessionId),
  );
}

/** Cuánto se guarda el puesto de una sesión tras su `/clear`. */
const RESERVE_MS = 30_000;

/** Primer índice libre; con la paleta llena, el menos repetido. */
function freeIdentity(
  taken: ReadonlySet<number>,
  slots: readonly SessionSlot[],
): number {
  for (let i = 0; i < IDENTITY_COLORS; i++) if (!taken.has(i)) return i;
  const counts = new Array<number>(IDENTITY_COLORS).fill(0);
  for (const s of slots) counts[s.identity] = (counts[s.identity] ?? 0) + 1;
  return counts.indexOf(Math.min(...counts));
}
