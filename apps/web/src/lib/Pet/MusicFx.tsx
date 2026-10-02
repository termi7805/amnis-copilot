import styles from "./Pet.module.css";

const NOTE_POS = [
  { n: "n1", x: 12, y: 31 },
  { n: "n2", x: 7, y: 25 },
  { n: "n3", x: 14, y: 21 },
] as const;

/**
 * Notas y ondas de la capa de música (#62), a la izquierda de la cabeza. Van
 * a nivel de `<svg>`, no dentro de la escena: no heredan el bob del cuerpo.
 * Siempre están las tres notas y las tres ondas; qué se ve y cómo se mueve lo
 * decide la vibe desde el CSS (`data-vibe` en el `<svg>`).
 */
export function MusicFx({ visible }: { visible: boolean }) {
  return (
    <g className={styles.fx} data-music="fx" data-visible={visible}>
      {NOTE_POS.map(({ n, x, y }) => (
        <g key={n} transform={`translate(${x} ${y})`}>
          <g className={`${styles.note} ${styles[n]}`}>
            <path
              d="M0 0v-7.5l5-1.5v7"
              fill="none"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <ellipse cx="-1.3" cy="0.4" rx="2" ry="1.5" />
            <ellipse cx="3.7" cy="-1.1" rx="2" ry="1.5" />
          </g>
        </g>
      ))}
      <g fill="none" strokeWidth="1.4" strokeLinecap="round">
        <path className={`${styles.wave} ${styles.w1}`} d="M12 40Q8 45 12 50" />
        <path className={`${styles.wave} ${styles.w2}`} d="M8 37Q2 45 8 53" />
        <path className={`${styles.wave} ${styles.w3}`} d="M4 34Q-4 45 4 56" />
      </g>
    </g>
  );
}
