import type { Listening } from "@amnis/shared";

/**
 * Pistas de ejemplo de la vista previa de MusicSettings. Sin portada: la
 * vista previa no depende de una URL externa, y la pantalla cae al texto.
 */
const FIRST: Listening["track"] = {
  id: "preview-1",
  title: "Neon Lights",
  artist: "Amnis Demo",
  imageUrl: null,
};

export const PREVIEW_TRACKS: Listening["track"][] = [
  FIRST,
  {
    id: "preview-2",
    title: "Late Night Compile",
    artist: "Bit & Co",
    imageUrl: null,
  },
  {
    id: "preview-3",
    title: "Rebase Blues",
    artist: "The Mergers",
    imageUrl: null,
  },
];

/** La pista de ejemplo número `index`, dando la vuelta al llegar al final. */
export function previewTrack(index: number): Listening["track"] {
  return PREVIEW_TRACKS[index % PREVIEW_TRACKS.length] ?? FIRST;
}
