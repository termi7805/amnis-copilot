import type { Vibe } from "@amnis/shared";
import { VIBE_COLOR } from "./musicLayer.ts";

/**
 * Cascos de Amnis (#61): geometría única de #60, porque la cabeza tiene las
 * mismas coordenadas en las 12 escenas — marco 62×48 en (24,22), pantalla
 * 54×40. Va dentro del grupo de la cabeza, justo tras la pantalla, así que
 * hereda lo que haga el cuerpo de cada escena (bob, respiración…).
 *
 * Estático: el cabeceo al BPM es de #62. Solo el LED lleva color, el de la
 * vibe; la forma y el color del cuerpo no cambian.
 */
export function Headphones({ vibe }: { vibe: Vibe }) {
  const led = VIBE_COLOR[vibe];
  return (
    <g data-testid="headphones" data-music="headphones" data-vibe={vibe}>
      <path
        d="M21 46C21 9 89 9 89 46"
        fill="none"
        stroke="#2A313B"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M23 40C25 15 85 15 87 40"
        fill="none"
        stroke="#5B6776"
        strokeWidth="1"
        strokeLinecap="round"
        opacity=".7"
      />
      <rect x="15" y="35" width="11" height="20" rx="4.5" fill="#2F3742" />
      <rect x="22" y="37.5" width="4.5" height="15" rx="2" fill="#3C4552" />
      <rect x="84" y="35" width="11" height="20" rx="4.5" fill="#2F3742" />
      <rect x="83.5" y="37.5" width="4.5" height="15" rx="2" fill="#3C4552" />
      <circle cx="18.6" cy="45" r="1.5" fill={led} opacity=".9" />
      <circle cx="91.4" cy="45" r="1.5" fill={led} opacity=".9" />
    </g>
  );
}
