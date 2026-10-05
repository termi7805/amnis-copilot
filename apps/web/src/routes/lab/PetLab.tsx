import type { Listening, PetState, ScreenMode, Vibe } from "@amnis/shared";
import { type CSSProperties, useState } from "react";
import petStyles from "../../lib/Pet/Pet.module.css";
import { Pet } from "../../lib/Pet/Pet.tsx";
import {
  animationClass,
  animationCss,
  catalogCss,
  pivotStyle,
  SERIES_ANIMATIONS,
} from "../../lib/Pet/skinAnimations.ts";
import styles from "./PetLab.module.css";

const STATES: PetState[] = [
  "coding",
  "testing",
  "researching",
  "planning",
  "resting",
  "sleeping",
  "terminal",
  "subagents",
  "committing",
  "pushing",
  "waiting",
  "limited",
];

const VIBES: Vibe[] = [
  "fiesta",
  "intensa",
  "chill",
  "melancolica",
  "podcast",
  "neutral",
];

const SIZES = {
  "150×110": { width: 150, height: 110 },
  "196×144": { width: 196, height: 143.73 },
} as const;
type SizeId = keyof typeof SIZES;

const SCREENS: ScreenMode[] = [
  "two-phase",
  "cover",
  "cover-title",
  "pixel",
  "text",
  "none",
];

const TRACKS = [
  { title: "Get Lucky", artist: "Daft Punk" },
  { title: "Bohemian Rhapsody (Remastered 2011)", artist: "Queen" },
];

/** Sin BPM en podcast y sin datos, como los manda el daemon. */
const bpmOf = (vibe: Vibe) =>
  vibe === "podcast" || vibe === "neutral" ? null : 120;

function listeningFor(vibe: Vibe, trackIndex: number): Listening {
  const track = TRACKS[trackIndex % TRACKS.length] as (typeof TRACKS)[number];
  return {
    vibe,
    bpm: bpmOf(vibe),
    track: { id: `lab-${trackIndex}`, imageUrl: null, ...track },
  };
}

/** Misma forma que las de serie: lo que una skin escribiría en su manifest. */
const HANDMADE = {
  beats: 2,
  keyframes: [
    { at: 0, rotate: 0 },
    { at: 50, rotate: 30, x: 4 },
    { at: 100, rotate: 0 },
  ],
};

const PIVOTS: [number, number][] = [
  [10, 10],
  [40, 15],
  [20, 40],
  [35, 35],
];

const ANIMATIONS_CSS = `${catalogCss()}
${animationCss("lab-hecha-a-mano", HANDMADE)}`;

/**
 * Banco de pruebas de la capa de música (#60): el `<Pet>` real en cada estado
 * y vibe, a los dos tamaños reales de la ventana de la mascota. Solo existe en
 * desarrollo (`main.tsx`).
 */
export function PetLab() {
  const [size, setSize] = useState<SizeId>("150×110");
  const [paused, setPaused] = useState(false);
  const [fatigue, setFatigue] = useState(0);
  const [screen, setScreen] = useState<ScreenMode>("two-phase");
  const [track, setTrack] = useState(0);
  const [dark, setDark] = useState(false);

  return (
    <div
      className={styles.lab}
      data-paused={paused}
      data-dark={dark}
      data-testid="pet-lab"
    >
      <div className={styles.controls}>
        <label>
          Tamaño{" "}
          <select
            value={size}
            onChange={(e) => setSize(e.target.value as SizeId)}
          >
            {Object.keys(SIZES).map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <label>
          Fatiga{" "}
          <select
            value={fatigue}
            onChange={(e) => setFatigue(Number(e.target.value))}
          >
            {[0, 0.5, 1].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pantalla{" "}
          <select
            value={screen}
            onChange={(e) => setScreen(e.target.value as ScreenMode)}
          >
            {SCREENS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setTrack((t) => t + 1)}>
          Cambiar pista ({TRACKS[track % TRACKS.length]?.title})
        </button>
        <label>
          <input
            type="checkbox"
            checked={paused}
            onChange={(e) => setPaused(e.target.checked)}
          />{" "}
          Pausar animaciones
        </label>
        <label>
          <input
            type="checkbox"
            checked={dark}
            onChange={(e) => setDark(e.target.checked)}
          />{" "}
          Fondo oscuro
        </label>
      </div>

      <style>{ANIMATIONS_CSS}</style>
      <section data-testid="animations">
        <h3>
          Animaciones ({Object.keys(SERIES_ANIMATIONS).length} de serie + 1 a
          mano)
        </h3>
        <div className={styles.animations}>
          {[...Object.keys(SERIES_ANIMATIONS), "lab-hecha-a-mano"].map(
            (name, i) => (
              <figure key={name} className={styles.anim}>
                <svg
                  className={petStyles.pet}
                  viewBox="0 0 50 50"
                  width={100}
                  height={100}
                  style={{ "--pet-fatigue": fatigue } as CSSProperties}
                  role="img"
                  aria-label={name}
                >
                  <rect
                    x="10"
                    y="10"
                    width="20"
                    height="20"
                    rx="3"
                    fill="#39e0c8"
                    className={animationClass(name)}
                    data-testid={`anim-${name}`}
                    style={pivotStyle(
                      PIVOTS[i % PIVOTS.length] as [number, number],
                    )}
                  />
                </svg>
                <figcaption>{name}</figcaption>
              </figure>
            ),
          )}
        </div>
      </section>

      <table className={styles.grid}>
        <thead>
          <tr>
            <th />
            {VIBES.map((vibe) => (
              <th key={vibe}>{vibe}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STATES.map((state) => (
            <tr key={state}>
              <th scope="row">{state}</th>
              {VIBES.map((vibe) => (
                <td key={vibe}>
                  <div
                    className={styles.cell}
                    style={SIZES[size]}
                    data-testid={`cell-${state}-${vibe}`}
                  >
                    <Pet
                      state={state}
                      level={1}
                      fatigue={fatigue}
                      listening={listeningFor(vibe, track)}
                      musicPrefs={{ screen }}
                    />
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
