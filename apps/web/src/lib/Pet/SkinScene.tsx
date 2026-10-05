import {
  isSkinTextLayer,
  SKIN_SCENE,
  type SkinImageLayer,
  type SkinLayer,
  type SkinManifest,
  type SkinTextLayer,
} from "@amnis/shared";
import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import { countdownText } from "./countdown.ts";
import { Headphones } from "./Headphones.tsx";
import styles from "./Pet.module.css";
import {
  animationClass,
  animationCss,
  catalogCss,
  pivotStyle,
  STRIP_CSS,
  STRIP_FRAME_WIDTH,
  stripStyle,
} from "./skinAnimations.ts";

/** Una skin lista para pintar: manifest ya validado y dónde está cada imagen. */
export interface PetSkin {
  id: string;
  manifest: SkinManifest;
  imageUrl: (src: string) => string;
}

const PLACEHOLDER = "······";
const { width: W, height: H } = SKIN_SCENE;

/** Centro de la pantalla de BIT: el punto de la geometría de cascos y pantalla que `anchor` coloca. */
const HEAD_CENTER = { x: 55, y: 46 } as const;

/** Todas las imágenes de la skin, para que un cambio de estado no parpadee en blanco. */
export function useSkinPreload(skin: PetSkin | null | undefined): void {
  const held = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    if (!skin) {
      held.current = [];
      return;
    }
    const srcs = new Set<string>();
    for (const state of Object.values(skin.manifest.states)) {
      for (const layer of state.layers) {
        if (!isSkinTextLayer(layer)) srcs.add(layer.src);
      }
    }
    held.current = [...srcs].map((src) => {
      const img = new Image();
      img.src = skin.imageUrl(src);
      return img;
    });
  }, [skin]);
}

function motion(layer: SkinLayer): {
  className?: string;
  style?: CSSProperties;
} {
  return {
    ...(layer.anim && { className: animationClass(layer.anim) }),
    ...(layer.pivot && { style: pivotStyle(layer.pivot) }),
  };
}

function ImageLayer({
  layer,
  href,
  clipId,
  windowId,
}: {
  layer: SkinImageLayer;
  href: string;
  clipId: string;
  windowId: string;
}) {
  const strip = layer.frames ? stripStyle(layer.frames, layer.beats) : null;
  const picture = strip ? (
    <g clipPath={`url(#${windowId})`}>
      <clipPath id={windowId}>
        <rect x="0" y="0" width={W} height={H} />
      </clipPath>
      <image
        href={href}
        x="0"
        y="0"
        width={STRIP_FRAME_WIDTH * (layer.frames ?? 1)}
        height={H}
        preserveAspectRatio="none"
        className={strip.className}
        style={strip.style}
      />
    </g>
  ) : (
    <image
      href={href}
      x="0"
      y="0"
      width={W}
      height={H}
      preserveAspectRatio="none"
    />
  );
  const moving = <g {...motion(layer)}>{picture}</g>;
  if (!layer.clip) return moving;
  const [x, y, w, h] = layer.clip;
  return (
    <g clipPath={`url(#${clipId})`}>
      <clipPath id={clipId}>
        <rect x={x} y={y} width={w} height={h} />
      </clipPath>
      {moving}
    </g>
  );
}

function TextLayer({ layer, value }: { layer: SkinTextLayer; value: string }) {
  return (
    <g {...motion(layer)}>
      <text
        x={layer.at[0]}
        y={layer.at[1]}
        fill={layer.color}
        fontSize={layer.size}
        fontFamily="ui-monospace,Menlo,monospace"
        fontWeight={600}
      >
        {value}
      </text>
    </g>
  );
}

/**
 * Lo que una skin pinta para un estado: sus capas en orden, dentro del mismo
 * viewBox 150×110 que BIT.
 *
 * ⚠️ Siempre `<image href>`: un SVG de la skin no ejecuta scripts ni carga
 * recursos externos así, uno incrustado sí. El CSS sale de `animationCss` y
 * `stripStyle`, nunca de texto del manifest.
 */
export function SkinScene({
  skin,
  layers,
  commitHash,
  resetsAt,
  music,
  screen,
}: {
  skin: PetSkin;
  layers: SkinLayer[];
  commitHash?: string | null;
  resetsAt?: string | null;
  /** `undefined` = sin capa de música. */
  music?: ComponentProps<typeof Headphones>;
  screen?: ReactNode;
}) {
  // `useId` lleva `:`, que no vale dentro de `url(#…)`.
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const customCss = useMemo(
    () =>
      Object.entries(skin.manifest.animations)
        .map(([name, anim]) => animationCss(name, anim))
        .join("\n"),
    [skin.manifest],
  );
  const values = {
    commitHash: commitHash ?? PLACEHOLDER,
    resetsCountdown: countdownText(resetsAt),
  };

  return (
    <g data-look="skin" data-skin={skin.id}>
      <style href="amnis-skin-catalog" precedence="medium">
        {`${catalogCss()}\n${STRIP_CSS}`}
      </style>
      {customCss && <style>{customCss}</style>}
      {layers.map((layer, i) => {
        // Las capas son un orden fijo del manifest: el índice es la identidad.
        const key = `${uid}-${i}`;
        if (isSkinTextLayer(layer)) {
          return (
            <TextLayer key={key} layer={layer} value={values[layer.text]} />
          );
        }
        const image = (
          <ImageLayer
            key={key}
            layer={layer}
            href={skin.imageUrl(layer.src)}
            clipId={`skin-clip-${key}`}
            windowId={`skin-win-${key}`}
          />
        );
        if (layer.role !== "head" || !layer.anchor) return image;
        const [ax, ay] = layer.anchor;
        const origin = layer.pivot ?? layer.anchor;
        return (
          <g
            key={key}
            className={styles.head}
            style={pivotStyle(origin)}
            data-skin-head
          >
            {image}
            <g {...motion(layer)}>
              <g
                transform={`translate(${ax} ${ay}) scale(${layer.scale ?? 1}) translate(${-HEAD_CENTER.x} ${-HEAD_CENTER.y})`}
              >
                {music && <Headphones {...music} />}
                {screen}
              </g>
            </g>
          </g>
        );
      })}
    </g>
  );
}
