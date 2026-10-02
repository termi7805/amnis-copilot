import type { Listening } from "@amnis/shared";
import {
  type CSSProperties,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import styles from "./Pet.module.css";
import type { ScreenPhase } from "./useNowPlaying.ts";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface Fit {
  shown: string;
  /** Desplazamiento de la marquesina (negativo) o 0 si cabe. */
  dx: number;
}

/**
 * Un texto que no se sale de su columna. Si no cabe, o se desplaza (marquesina,
 * `--dx`) o, con movimiento reducido, se corta con "…". La medida es la del
 * navegador (`getComputedTextLength`); sin ella (jsdom) se enseña entero. La
 * fuente es monoespaciada, así que el recorte por proporción es exacto.
 */
function FitText({
  text,
  x,
  y,
  fontSize,
  maxWidth,
  scroll,
  weight,
  opacity,
  durationS,
}: {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  maxWidth: number;
  scroll: boolean;
  weight?: number;
  opacity?: number;
  durationS: number;
}) {
  const ref = useRef<SVGTextElement>(null);
  const [fit, setFit] = useState<Fit>({ shown: text, dx: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    const measure = el?.getComputedTextLength;
    const width =
      el && typeof measure === "function" ? el.getComputedTextLength() : 0;
    if (!width || width <= maxWidth) {
      setFit({ shown: text, dx: 0 });
    } else if (scroll) {
      setFit({ shown: text, dx: maxWidth - width });
    } else {
      const perChar = width / Math.max(1, text.length);
      const keep = Math.max(1, Math.floor(maxWidth / perChar) - 1);
      setFit({ shown: `${text.slice(0, keep)}…`, dx: 0 });
    }
  }, [text, maxWidth, scroll]);

  const long = fit.dx !== 0;
  const marquee = {
    "--dx": `${fit.dx.toFixed(1)}px`,
    "--np-dur": `${durationS}s`,
  } as CSSProperties;
  return (
    <g className={long ? styles.marquee : undefined} style={marquee}>
      <text
        ref={ref}
        x={x}
        y={y}
        className={styles.npText}
        fontSize={fontSize}
        fontWeight={weight}
        opacity={opacity}
      >
        {fit.shown}
      </text>
    </g>
  );
}

export interface NowPlayingScreenProps {
  track: Listening["track"];
  phase: ScreenPhase;
  /** Está terminando: se apaga antes de volver la cara. */
  closing: boolean;
  entry: "tv" | "fade";
  scanlines: boolean;
  /** Portada 16×16 ampliada (modo `pixel`); `null` cae a la nítida. */
  pixelUrl: string | null;
  /** Duración de la fase de texto, para la marquesina. */
  textSeconds: number;
}

/**
 * Pantalla "sonando" (#64): tapa la cara de Amnis unos segundos al cambiar de
 * canción. Va dentro del grupo de la cabeza, encima de la cara, así que se
 * mueve con el cabeceo. Valores de #60.
 *
 * Los modos con portada sin `imageUrl` caen a texto: una pantalla vacía no
 * dice nada. El desplazamiento de título y artista se recorta a su columna
 * con un `clipPath` propio; sin él, el texto pasaría por encima de la portada.
 */
export function NowPlayingScreen({
  track,
  phase,
  closing,
  entry,
  scanlines,
  pixelUrl,
  textSeconds,
}: NowPlayingScreenProps) {
  const uid = useId().replace(/:/g, "");
  const reduced = prefersReducedMotion();
  const scroll = !reduced;

  const hasCover = track.imageUrl !== null;
  const shownPhase: ScreenPhase =
    phase === "text" || !hasCover
      ? "text"
      : phase === "pixel" && !pixelUrl
        ? "cover"
        : phase;
  const cover = track.imageUrl ?? "";
  const withScan = scanlines && shownPhase !== "text";

  return (
    <g
      className={styles.np}
      data-testid="now-playing"
      data-music="screen"
      data-phase={shownPhase}
      data-entry={entry}
      data-visible={!closing}
    >
      <defs>
        <clipPath id={`${uid}-screen`}>
          <rect x="28" y="26" width="54" height="40" rx="5" />
        </clipPath>
        <clipPath id={`${uid}-side`}>
          <rect x="57.5" y="26" width="22.5" height="40" />
        </clipPath>
        <pattern
          id={`${uid}-scan`}
          width="2"
          height="1.6"
          patternUnits="userSpaceOnUse"
        >
          <rect width="2" height="0.6" fill="#000" />
        </pattern>
      </defs>
      <rect x="28" y="26" width="54" height="40" rx="5" fill="#171D26" />
      <g clipPath={`url(#${uid}-screen)`}>
        {shownPhase === "cover" && (
          <image
            href={cover}
            x="35"
            y="26"
            width="40"
            height="40"
            preserveAspectRatio="xMidYMid slice"
          />
        )}
        {shownPhase === "pixel" && pixelUrl && (
          <image
            href={pixelUrl}
            x="28"
            y="26"
            width="54"
            height="40"
            preserveAspectRatio="xMidYMid slice"
            style={{ imageRendering: "pixelated" }}
          />
        )}
        {shownPhase === "cover-title" && (
          <>
            <image
              href={cover}
              x="31"
              y="33"
              width="24"
              height="24"
              preserveAspectRatio="xMidYMid slice"
            />
            <g clipPath={`url(#${uid}-side)`}>
              <FitText
                text={track.title}
                x={58}
                y={44}
                fontSize={5.6}
                maxWidth={22}
                scroll={scroll}
                durationS={textSeconds}
              />
              <FitText
                text={track.artist}
                x={58}
                y={51}
                fontSize={4.4}
                maxWidth={22}
                scroll={scroll}
                opacity={0.75}
                durationS={textSeconds}
              />
            </g>
          </>
        )}
        {shownPhase === "text" && (
          <>
            <g
              transform="translate(34.5 37) scale(.62)"
              className={styles.npIcon}
            >
              <path
                d="M0 0v-7.5l5-1.5v7"
                fill="none"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <ellipse cx="-1.3" cy="0.4" rx="2" ry="1.5" />
              <ellipse cx="3.7" cy="-1.1" rx="2" ry="1.5" />
            </g>
            <text
              x="41"
              y="35.6"
              className={styles.npText}
              fontSize="4.2"
              letterSpacing=".5"
              opacity=".65"
            >
              SONANDO
            </text>
            <FitText
              text={track.title}
              x={33}
              y={50}
              fontSize={7.4}
              weight={500}
              maxWidth={44}
              scroll={scroll}
              durationS={textSeconds}
            />
            <FitText
              text={track.artist}
              x={33}
              y={59}
              fontSize={5.4}
              opacity={0.75}
              maxWidth={44}
              scroll={scroll}
              durationS={textSeconds}
            />
          </>
        )}
        {withScan && (
          <rect
            x="28"
            y="26"
            width="54"
            height="40"
            fill={`url(#${uid}-scan)`}
            opacity=".28"
          />
        )}
      </g>
    </g>
  );
}
