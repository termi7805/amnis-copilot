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

/**
 * Lo que `<Pet>` recibe como skin: la skin lista, `null` para BIT o
 * `"loading"` mientras llega (ni BIT ni skin: escena vacía del mismo tamaño).
 */
export type SkinChoice = PetSkin | null | "loading";

const PLACEHOLDER = "······";
const { width: W, height: H } = SKIN_SCENE;

/** Centro de la pantalla de BIT: el punto de la geometría de cascos y pantalla que `anchor` coloca. */
const HEAD_CENTER = { x: 55, y: 46 } as const;

/** Las URLs de todas las imágenes de la skin, sin repetir. */
export function skinImageUrls(skin: PetSkin): string[] {
  const srcs = new Set<string>();
  for (const state of Object.values(skin.manifest.states)) {
    for (const layer of state.layers) {
      if (!isSkinTextLayer(layer)) srcs.add(layer.src);
    }
  }
  return [...srcs].map((src) => skin.imageUrl(src));
}

/** Todas las imágenes de la skin, para que un cambio de estado no parpadee en blanco. */
export function useSkinPreload(skin: PetSkin | null | undefined): void {
  const held = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    if (!skin) {
      held.current = [];
      return;
    }
    held.current = skinImageUrls(skin).map((url) => {
      const img = new Image();
      img.src = url;
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

/**
 * Capa `identity`: la imagen solo pone la silueta (su alfa, como máscara) y el
 * color es el de la sesión (`--pet-identity`, que fija `<Pet>`).
 */
function IdentityLayer({
  maskId,
  children,
}: {
  maskId: string;
  children: ReactNode;
}) {
  return (
    <g data-skin-identity>
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width={W}
        height={H}
        style={{ maskType: "alpha" }}
      >
        {children}
      </mask>
      <rect
        x="0"
        y="0"
        width={W}
        height={H}
        fill="var(--pet-identity)"
        mask={`url(#${maskId})`}
      />
    </g>
  );
}

/**
 * Coloca la geometría de cascos y pantalla «sonando» (dibujada sobre la cara
 * de BIT) en `anchor` y a `scale`. La misma fórmula para la cabeza y para la
 * capa `player`: una skin sin `player` sale en el mismo píxel que antes.
 */
function MusicOverlay({
  anchor: [ax, ay],
  scale = 1,
  children,
}: {
  anchor: [number, number];
  scale?: number;
  children: ReactNode;
}) {
  return (
    <g
      transform={`translate(${ax} ${ay}) scale(${scale}) translate(${-HEAD_CENTER.x} ${-HEAD_CENTER.y})`}
    >
      {children}
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
  identity = false,
}: {
  skin: PetSkin;
  layers: SkinLayer[];
  commitHash?: string | null;
  resetsAt?: string | null;
  /** `undefined` = sin capa de música. */
  music?: ComponentProps<typeof Headphones>;
  /** Pantalla «sonando»: en la capa `player` si la hay; si no, en la `head`. */
  screen?: ReactNode;
  /** Hay color de identidad: las capas `identity` se pintan con él; sin él, no salen. */
  identity?: boolean;
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
  const hasPlayer = layers.some(
    (l) => !isSkinTextLayer(l) && l.role === "player",
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
        const picture = (
          <ImageLayer
            key={key}
            layer={layer}
            href={skin.imageUrl(layer.src)}
            clipId={`skin-clip-${key}`}
            windowId={`skin-win-${key}`}
          />
        );
        const image = !layer.identity ? (
          picture
        ) : identity ? (
          <IdentityLayer key={key} maskId={`skin-id-${key}`}>
            {picture}
          </IdentityLayer>
        ) : null;
        if (!layer.role || !layer.anchor) return image;
        if (layer.role === "player") {
          return (
            <g key={key} data-skin-player>
              {image}
              <g {...motion(layer)}>
                <MusicOverlay anchor={layer.anchor} scale={layer.scale}>
                  {screen}
                </MusicOverlay>
              </g>
            </g>
          );
        }
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
              <MusicOverlay anchor={layer.anchor} scale={layer.scale}>
                {music && layer.headphones !== false && (
                  <Headphones {...music} />
                )}
                {!hasPlayer && layer.player !== false && screen}
              </MusicOverlay>
            </g>
          </g>
        );
      })}
    </g>
  );
}
