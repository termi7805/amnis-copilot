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

type Option<T extends string> = { value: T; label: string };

const MOTION_OPTIONS: Option<MusicPrefs["motion"]>[] = [
  { value: "head", label: "Cabeza y cascos" },
  { value: "accessory", label: "Solo cascos" },
];
const COLOR_OPTIONS: Option<MusicPrefs["color"]>[] = [
  { value: "vibe", label: "Vibe" },
  { value: "cover", label: "Portada" },
  { value: "teal", label: "Teal" },
];
const FALLBACK_OPTIONS: Option<MusicPrefs["fallback"]>[] = [
  { value: "neutral", label: "Notas neutras" },
  { value: "quiet", label: "Solo cascos" },
];
const ENTRY_OPTIONS: Option<MusicPrefs["screenEntry"]>[] = [
  { value: "tv", label: "Tele" },
  { value: "fade", label: "Fundido" },
];

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

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      className={styles.toggle}
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}

/** Opciones de dos o tres valores: con un segmentado se ven todas sin abrir
 * un desplegable (#102). */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.field}>
      <span>{label}</span>
      {/* biome-ignore lint/a11y/useSemanticElements: un <fieldset> arrastra borde y padding del navegador a un conmutador segmentado */}
      <div className={styles.seg} role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
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
      <div className={styles.head}>
        <h2 id="music-settings-title">Mascota · Música</h2>
        <span className={styles.eyebrow}>
          se aplica al instante en la ventana flotante
        </span>
      </div>
      <div className={styles.layout}>
        <fieldset className={styles.controls} disabled={disabled}>
          <div className={styles.switchRow}>
            <div>
              <div className={styles.t}>Capa de música</div>
              <div className={styles.s}>
                Cascos, notas y cabeceo cuando suena Spotify. Se apaga sola en
                «esperando permiso» y «límite».
              </div>
            </div>
            <Switch
              label="Capa de música"
              checked={prefs.enabled}
              onChange={(enabled) => commit({ enabled })}
            />
          </div>
          <div className={styles.fields}>
            <Segmented
              label="Qué se mueve"
              value={prefs.motion}
              options={MOTION_OPTIONS}
              onChange={(motion) => commit({ motion })}
            />
            <Segmented
              label="Color de la capa"
              value={prefs.color}
              options={COLOR_OPTIONS}
              onChange={(color) => commit({ color })}
            />
            <Field label="Cuánto frena la fatiga">
              <div className={styles.rangeRow}>
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
                <output>{Math.round(prefs.damping * 100)} %</output>
              </div>
            </Field>
            <Segmented
              label="Sin datos de la canción"
              value={prefs.fallback}
              options={FALLBACK_OPTIONS}
              onChange={(fallback) => commit({ fallback })}
            />
            <Field label="Pantalla al cambiar de canción">
              <select
                value={prefs.screen}
                onChange={(e) =>
                  commit({ screen: e.target.value as ScreenMode })
                }
              >
                {(Object.keys(SCREEN_LABEL) as ScreenMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {SCREEN_LABEL[mode]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tiempo en pantalla">
              <div className={styles.rangeRow}>
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
                <output>{prefs.screenSeconds} s</output>
              </div>
            </Field>
            <Segmented
              label="Entrada"
              value={prefs.screenEntry}
              options={ENTRY_OPTIONS}
              onChange={(screenEntry) => commit({ screenEntry })}
            />
            <div className={styles.field}>
              <span>Líneas de pantalla</span>
              <Switch
                label="Líneas de pantalla"
                checked={prefs.scanlines}
                onChange={(scanlines) => commit({ scanlines })}
              />
            </div>
          </div>
          <button type="button" className={styles.btn} onClick={reset}>
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
            <button
              type="button"
              className={styles.btn}
              onClick={() => setTrackIndex((i) => i + 1)}
            >
              Siguiente canción
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
