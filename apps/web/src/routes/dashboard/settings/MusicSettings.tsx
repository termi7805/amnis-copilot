import {
  DEFAULT_MUSIC_PREFS,
  type Listening,
  type MusicPrefs,
  type PetState,
  type ScreenMode,
  type Vibe,
} from "@amnis/shared";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SaveSettingsResult } from "../../../api/settings.ts";
import { settings as settingsMessages } from "../../../i18n/es/settings.ts";
import { PET_STATES, Pet, stateTitle } from "../../../lib/Pet/Pet.tsx";
import styles from "./MusicSettings.module.css";
import { previewTrack } from "./previewTracks.ts";

/** Los sliders guardan tras este silencio: un `PUT` por píxel arrastrado
 * saturaría el SSE de la mascota. */
export const SLIDER_DEBOUNCE_MS = 300;

const SCREENS = Object.keys(settingsMessages.music.screens) as ScreenMode[];
const VIBES = Object.keys(settingsMessages.music.vibes) as Vibe[];

type Option<T extends string> = { value: T; label: string };

const options = <T extends string>(
  values: readonly T[],
  label: (value: T) => string,
): Option<T>[] => values.map((value) => ({ value, label: label(value) }));

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

export function Switch({
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
  const { t } = useTranslation();
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
    ? t("settings.music.layerDisabled")
    : state === "waiting" || state === "limited"
      ? t("settings.music.layerAttention")
      : null;

  return (
    <section className={styles.panel} aria-labelledby="music-settings-title">
      <div className={styles.head}>
        <h2 id="music-settings-title">{t("settings.music.title")}</h2>
        <span className={styles.eyebrow}>{t("settings.music.eyebrow")}</span>
      </div>
      <div className={styles.layout}>
        <fieldset className={styles.controls} disabled={disabled}>
          <div className={styles.switchRow}>
            <div>
              <div className={styles.t}>{t("settings.music.layer")}</div>
              <div className={styles.s}>{t("settings.music.layerHint")}</div>
            </div>
            <Switch
              label={t("settings.music.layer")}
              checked={prefs.enabled}
              onChange={(enabled) => commit({ enabled })}
            />
          </div>
          <div className={styles.fields}>
            <Segmented
              label={t("settings.music.whatMoves")}
              value={prefs.motion}
              options={options<MusicPrefs["motion"]>(
                ["head", "accessory"],
                (v) => t(`settings.music.motion.${v}`),
              )}
              onChange={(motion) => commit({ motion })}
            />
            <Segmented
              label={t("settings.music.layerColor")}
              value={prefs.color}
              options={options<MusicPrefs["color"]>(
                ["vibe", "cover", "teal"],
                (v) => t(`settings.music.color.${v}`),
              )}
              onChange={(color) => commit({ color })}
            />
            <Field label={t("settings.music.damping")}>
              <div className={styles.rangeRow}>
                <input
                  type="range"
                  aria-label={t("settings.music.dampingLabel")}
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
              label={t("settings.music.noData")}
              value={prefs.fallback}
              options={options<MusicPrefs["fallback"]>(
                ["neutral", "quiet"],
                (v) => t(`settings.music.fallback.${v}`),
              )}
              onChange={(fallback) => commit({ fallback })}
            />
            <Field label={t("settings.music.screen")}>
              <select
                value={prefs.screen}
                onChange={(e) =>
                  commit({ screen: e.target.value as ScreenMode })
                }
              >
                {SCREENS.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`settings.music.screens.${mode}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("settings.music.screenTime")}>
              <div className={styles.rangeRow}>
                <input
                  type="range"
                  aria-label={t("settings.music.screenTime")}
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
              label={t("settings.music.entryLabel")}
              value={prefs.screenEntry}
              options={options<MusicPrefs["screenEntry"]>(["tv", "fade"], (v) =>
                t(`settings.music.entry.${v}`),
              )}
              onChange={(screenEntry) => commit({ screenEntry })}
            />
            <div className={styles.field}>
              <span>{t("settings.music.scanlines")}</span>
              <Switch
                label={t("settings.music.scanlines")}
                checked={prefs.scanlines}
                onChange={(scanlines) => commit({ scanlines })}
              />
            </div>
          </div>
          <button type="button" className={styles.btn} onClick={reset}>
            {t("settings.music.reset")}
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
            <Field label={t("settings.music.sampleState")}>
              <select
                value={state}
                onChange={(e) => setState(e.target.value as PetState)}
              >
                {PET_STATES.map((s) => (
                  <option key={s} value={s}>
                    {stateTitle(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("settings.music.sampleVibe")}>
              <select
                value={vibe}
                onChange={(e) => setVibe(e.target.value as Vibe)}
              >
                {VIBES.map((v) => (
                  <option key={v} value={v}>
                    {t(`settings.music.vibes.${v}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("settings.music.sampleBpm", { bpm })}>
              <input
                type="range"
                aria-label={t("settings.music.sampleBpmLabel")}
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
              {t("settings.music.nextTrack")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
