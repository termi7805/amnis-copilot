import {
  IDENTITY_COLORS,
  type Listening,
  type PetState,
  type ScreenMode,
  SERIES_ANIMATIONS,
  type SkinSummary,
  THEMES,
  type ThemeId,
  type Vibe,
} from "@amnis/shared";
import { type CSSProperties, useEffect, useState } from "react";
import { fetchSkin, fetchSkins } from "../../api/skins.ts";
import petStyles from "../../lib/Pet/Pet.module.css";
import { Pet } from "../../lib/Pet/Pet.tsx";
import type { PetSkin } from "../../lib/Pet/SkinScene.tsx";
import {
  animationClass,
  animationCss,
  catalogCss,
  pivotStyle,
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

/** «Sistema» no tiene bloque propio en theme.css: el banco usa los temas con paleta. */
const LAB_THEMES = THEMES.filter((t) => t.id !== "system");

const IDENTITIES = Array.from({ length: IDENTITY_COLORS }, (_, i) => i);

/** Dato fijo para las capas de texto: dentro de 2 h al abrir el banco. */
const RESETS_AT = new Date(Date.now() + 2 * 3_600_000).toISOString();

/**
 * Banco de pruebas de la capa de música (#60): el `<Pet>` real en cada estado
 * y vibe, a los dos tamaños reales de la ventana de la mascota. Con un tema
 * elegido se pinta con su paleta, y la sección de identidades enseña los
 * colores de sesión lado a lado en cada estado (#164). Solo existe en
 * desarrollo (`main.tsx`).
 */
export function PetLab() {
  const [size, setSize] = useState<SizeId>("150×110");
  const [paused, setPaused] = useState(false);
  const [fatigue, setFatigue] = useState(0);
  const [screen, setScreen] = useState<ScreenMode>("two-phase");
  const [track, setTrack] = useState(0);
  const [dark, setDark] = useState(false);
  const [skins, setSkins] = useState<SkinSummary[]>([]);
  const [skinId, setSkinId] = useState("");
  const [skin, setSkin] = useState<PetSkin | null>(null);
  const [skinError, setSkinError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId | "">("");
  const [identity, setIdentity] = useState<number | undefined>(undefined);

  useEffect(() => {
    fetchSkins().then(setSkins, () => setSkins([]));
  }, []);

  const pickSkin = (id: string) => {
    setSkinId(id);
    setSkinError(null);
    if (id === "") {
      setSkin(null);
      return;
    }
    fetchSkin(id).then(setSkin, (err: Error) => {
      setSkin(null);
      setSkinError(err.message);
    });
  };

  return (
    <div
      className={styles.lab}
      data-paused={paused}
      data-dark={dark}
      data-theme={theme || undefined}
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
          Skin{" "}
          <select
            value={skinId}
            onChange={(e) => pickSkin(e.target.value)}
            data-testid="skin-select"
          >
            <option value="">BIT</option>
            {skins.map((s) => (
              <option
                key={s.id}
                value={s.id}
                disabled={s.errors.length > 0}
                title={s.errors.join("\n")}
              >
                {s.name ?? s.id}
              </option>
            ))}
          </select>
          {skinError && <span role="alert"> {skinError}</span>}
        </label>
        <label>
          Tema{" "}
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeId | "")}
            data-testid="theme-select"
          >
            <option value="">Banco</option>
            {LAB_THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Identidad{" "}
          <select
            value={identity ?? ""}
            onChange={(e) =>
              setIdentity(
                e.target.value === "" ? undefined : Number(e.target.value),
              )
            }
            data-testid="identity-select"
          >
            <option value="">Ninguna</option>
            {IDENTITIES.map((i) => (
              <option key={i} value={i}>
                {i}
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

      <section data-testid="identities">
        <h3>Identidades ({IDENTITY_COLORS} colores, sin música)</h3>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th />
              {IDENTITIES.map((i) => (
                <th key={i}>--id-{i}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STATES.map((state) => (
              <tr key={state}>
                <th scope="row">{state}</th>
                {IDENTITIES.map((i) => (
                  <td key={i}>
                    <div
                      className={styles.cell}
                      style={SIZES[size]}
                      data-testid={`identity-${state}-${i}`}
                    >
                      <Pet
                        state={state}
                        level={1}
                        fatigue={fatigue}
                        skin={skin}
                        commitHash="a1b2c3d"
                        resetsAt={RESETS_AT}
                        identity={i}
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
                      skin={skin}
                      commitHash="a1b2c3d"
                      resetsAt={RESETS_AT}
                      identity={identity}
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
