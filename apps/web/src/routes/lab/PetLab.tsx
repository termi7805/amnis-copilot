import type { Listening, PetState, ScreenMode, Vibe } from "@amnis/shared";
import { useState } from "react";
import { Pet } from "../../lib/Pet/Pet.tsx";
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
