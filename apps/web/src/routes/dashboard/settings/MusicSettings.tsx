import {
  DEFAULT_MUSIC_PREFS,
  type Listening,
  type MusicPrefs,
  type PetState,
  type ScreenMode,
  type Vibe,
} from "@amnis/shared";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { SaveSettingsResult } from "../../../api/settings.ts";
import { Pet, STATE_TITLE } from "../../../lib/Pet/Pet.tsx";
import styles from "./MusicSettings.module.css";
import { previewTrack } from "./previewTracks.ts";

/** Los sliders guardan tras este silencio: un `PUT` por píxel arrastrado
 * saturaría el SSE de la mascota. */
export const SLIDER_DEBOUNCE_MS = 300;

const SCREEN_LABEL: Record<ScreenMode, string> = {
  "two-phase": "Portada pixelada y luego nítida",
  cover: "Portada",
  "cover-title": "Portada + título",
  pixel: "Pixelada",
  text: "Solo texto",
  none: "Nada",
};

const VIBE_LABEL: Record<Vibe, string> = {
  fiesta: "Fiesta",
  intensa: "Intensa",
  chill: "Chill",
  melancolica: "Melancólica",
  podcast: "Podcast",
  neutral: "Neutral",
};

type SliderKey = "damping" | "screenSeconds";

export interface MusicSettingsProps {
  /** `undefined` mientras el dashboard no ha recibido el estado. */
  settings: MusicPrefs | undefined;
  save: (partial: Partial<MusicPrefs>) => Promise<SaveSettingsResult>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: el control llega como children
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * Sección "Mascota · Música" (#66): controles de las preferencias de #65 junto
 * a una vista previa con el mismo `<Pet>`. La vista previa usa los valores
 * locales, sin esperar al guardado ni al eco del SSE.
 */
export function MusicSettings({ settings, save }: MusicSettingsProps) {
  // Valores de sliders aún sin guardar: mientras se arrastra, mandan sobre el
  // eco del SSE para que el control no salte.
  const [drafts, setDrafts] = useState<Partial<Pick<MusicPrefs, SliderKey>>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Partial<Record<SliderKey, number>>>({});

  const [state, setState] = useState<PetState>("coding");
  const [vibe, setVibe] = useState<Vibe>("fiesta");
  const [bpm, setBpm] = useState(120);
  const [trackIndex, setTrackIndex] = useState(0);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of Object.values(pending)) window.clearTimeout(timer);
    };
  }, []);

  const prefs: MusicPrefs = { ...(settings ?? DEFAULT_MUSIC_PREFS), ...drafts };

  const listening = useMemo<Listening>(
    () => ({
      vibe,
      bpm: vibe === "podcast" ? null : bpm,
      track: previewTrack(trackIndex),
    }),
    [vibe, bpm, trackIndex],
  );

  async function commit(partial: Partial<MusicPrefs>) {
    const result = await save(partial);
    setError(result.ok ? null : result.message);
  }

  function setSlider(key: SliderKey, value: number) {
    setDrafts((current) => ({ ...current, [key]: value }));
    window.clearTimeout(timers.current[key]);
    timers.current[key] = window.setTimeout(
      () => flush(key, value),
      SLIDER_DEBOUNCE_MS,
    );
  }

  async function flush(key: SliderKey, value: number) {
    window.clearTimeout(timers.current[key]);
    delete timers.current[key];
    await commit({ [key]: value });
    // Si mientras tanto se movió otra vez, ese valor sigue mandando.
    setDrafts((current) => {
      if (current[key] !== value) return current;
      const { [key]: _saved, ...rest } = current;
      return rest;
    });
  }

  async function reset() {
    for (const timer of Object.values(timers.current))
      window.clearTimeout(timer);
    timers.current = {};
    setDrafts({});
    await commit(DEFAULT_MUSIC_PREFS);
  }

  const disabled = settings === undefined;
  const layerOff = !prefs.enabled
    ? "La música está desactivada: Amnis no lleva nada de la capa."
    : state === "waiting" || state === "limited"
      ? "En este estado Amnis pide atención y no lleva la capa de música."
      : null;

  return (
    <section className={styles.panel} aria-labelledby="music-settings-title">
      <h2 id="music-settings-title">Mascota · Música</h2>
      <div className={styles.layout}>
        <fieldset className={styles.controls} disabled={disabled}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={prefs.enabled}
              onChange={(e) => commit({ enabled: e.target.checked })}
            />
            Mostrar la música en Amnis
          </label>
          <Field label="Qué muestra la pantalla">
            <select
              value={prefs.screen}
              onChange={(e) => commit({ screen: e.target.value as ScreenMode })}
            >
              {(Object.keys(SCREEN_LABEL) as ScreenMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {SCREEN_LABEL[mode]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Tiempo en pantalla: ${prefs.screenSeconds} s`}>
            <input
              type="range"
              aria-label="Tiempo en pantalla"
              min={2}
              max={8}
              step={0.5}
              value={prefs.screenSeconds}
              onChange={(e) =>
                setSlider("screenSeconds", Number(e.target.value))
              }
              onPointerUp={(e) =>
                flush("screenSeconds", Number(e.currentTarget.value))
              }
            />
          </Field>
          <Field label="Entrada">
            <select
              value={prefs.screenEntry}
              onChange={(e) =>
                commit({
                  screenEntry: e.target.value as MusicPrefs["screenEntry"],
                })
              }
            >
              <option value="tv">Tele</option>
              <option value="fade">Fundido</option>
            </select>
          </Field>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={prefs.scanlines}
              onChange={(e) => commit({ scanlines: e.target.checked })}
            />
            Líneas de pantalla
          </label>
          <Field label="Quién baila">
            <select
              value={prefs.motion}
              onChange={(e) =>
                commit({ motion: e.target.value as MusicPrefs["motion"] })
              }
            >
              <option value="head">Accesorio + cabeza</option>
              <option value="accessory">Solo accesorio</option>
            </select>
          </Field>
          <Field
            label={`Amortiguación por fatiga: ${Math.round(prefs.damping * 100)} %`}
          >
            <input
              type="range"
              aria-label="Amortiguación por fatiga"
              min={0}
              max={1}
              step={0.05}
              value={prefs.damping}
              onChange={(e) => setSlider("damping", Number(e.target.value))}
              onPointerUp={(e) =>
                flush("damping", Number(e.currentTarget.value))
              }
            />
          </Field>
          <Field label="Color de la capa">
            <select
              value={prefs.color}
              onChange={(e) =>
                commit({ color: e.target.value as MusicPrefs["color"] })
              }
            >
              <option value="vibe">Por vibe</option>
              <option value="cover">De la portada</option>
              <option value="teal">Siempre teal</option>
            </select>
          </Field>
          <Field label="Sin datos de ReccoBeats">
            <select
              value={prefs.fallback}
              onChange={(e) =>
                commit({ fallback: e.target.value as MusicPrefs["fallback"] })
              }
            >
              <option value="neutral">Notas neutras</option>
              <option value="quiet">Solo cascos</option>
            </select>
          </Field>
          <button type="button" onClick={reset}>
            Restablecer valores por defecto
          </button>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </fieldset>

        <div className={styles.preview}>
          <div className={styles.stage}>
            <Pet
              state={state}
              level={1}
              fatigue={0.3}
              listening={listening}
              musicPrefs={prefs}
            />
          </div>
          {layerOff && <p className={styles.note}>{layerOff}</p>}
          <div className={styles.sample}>
            <Field label="Estado de ejemplo">
              <select
                value={state}
                onChange={(e) => setState(e.target.value as PetState)}
              >
                {(Object.keys(STATE_TITLE) as PetState[]).map((s) => (
                  <option key={s} value={s}>
                    {STATE_TITLE[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vibe de ejemplo">
              <select
                value={vibe}
                onChange={(e) => setVibe(e.target.value as Vibe)}
              >
                {(Object.keys(VIBE_LABEL) as Vibe[]).map((v) => (
                  <option key={v} value={v}>
                    {VIBE_LABEL[v]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`BPM de ejemplo: ${bpm}`}>
              <input
                type="range"
                aria-label="BPM de ejemplo"
                min={60}
                max={180}
                step={5}
                value={bpm}
                disabled={vibe === "podcast"}
                onChange={(e) => setBpm(Number(e.target.value))}
              />
            </Field>
            <button type="button" onClick={() => setTrackIndex((i) => i + 1)}>
              Siguiente canción
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
