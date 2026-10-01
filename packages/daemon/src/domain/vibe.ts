import type { Vibe } from "@amnis/shared";

/** Corte fijo de los dos ejes: `>= 0.5` es "alto". */
const CUT = 0.5;

/**
 * Vibe de una canción a partir de energía y valencia (la tabla 2×2 de #63).
 * Un episodio es `podcast` sin mirar features; sin datos, o con datos que no
 * son números finitos, `neutral` — la mascota usa entonces su animación
 * neutra, nunca una excepción.
 */
export function deriveVibe(
  features: { energy: number; valence: number } | null,
  kind: "track" | "episode",
): Vibe {
  if (kind === "episode") return "podcast";
  if (
    !features ||
    !Number.isFinite(features.energy) ||
    !Number.isFinite(features.valence)
  ) {
    return "neutral";
  }
  const energetic = features.energy >= CUT;
  const happy = features.valence >= CUT;
  if (energetic) return happy ? "fiesta" : "intensa";
  return happy ? "chill" : "melancolica";
}
