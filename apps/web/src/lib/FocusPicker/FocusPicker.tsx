import type { PetFocus, SessionsResponse } from "@amnis/shared";
import { type KeyboardEvent, useRef, useState } from "react";
import { fetchSessions } from "../../api/sessions.ts";
import { type SaveSettingsResult, saveSettings } from "../../api/settings.ts";
import { formatElapsed } from "../countdown.ts";
import { STATE_TITLE } from "../Pet/Pet.tsx";
import styles from "./FocusPicker.module.css";
import { focusLabel, hideEnded, sameFocus } from "./focus.ts";

/** Trazo de los iconos del dashboard (mockup v6); en `compact` no se usan. */
const STROKE_ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * `localStorage` y no `settings.json` (#127): solo lo usa este cliente, es una
 * comodidad del navegador como el panel plegado de la mascota.
 */
const SHOW_ENDED_KEY = "amnis-focus-show-ended";

function readShowEnded(): boolean {
  try {
    return localStorage.getItem(SHOW_ENDED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeShowEnded(on: boolean) {
  try {
    if (on) localStorage.setItem(SHOW_ENDED_KEY, "1");
    else localStorage.removeItem(SHOW_ENDED_KEY);
  } catch {
    // Sin almacenamiento la elección solo dura hasta recargar.
  }
}

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; sessions: SessionsResponse };

export interface FocusPickerProps {
  /** El foco con el que se calculó el estado (`PetSnapshot.focus`). */
  focus: PetFocus;
  now: Date;
  /** `compact`: la lista va en flujo (panel de la mascota, que crece con su
   * contenido). `popover`: flota sobre el dashboard sin empujar el layout. */
  layout?: "compact" | "popover";
  /** `never`: las sesiones terminadas no salen (mascota). `toggle`: un
   * interruptor al pie de la lista decide si salen (dashboard). */
  showEnded?: "never" | "toggle";
  loadSessions?: () => Promise<SessionsResponse>;
  save?: (partial: { petFocus: PetFocus }) => Promise<SaveSettingsResult>;
}

/**
 * Elige a qué mira la mascota. La lista se pide al abrir. Tras elegir, el foco
 * marcado lo cambia el siguiente snapshot por SSE (`focus`), no un estado
 * local: así la mascota y el dashboard no pueden mostrar cosas distintas.
 */
export function FocusPicker({
  focus,
  now,
  layout = "compact",
  showEnded = "never",
  loadSessions = fetchSessions,
  save = saveSettings,
}: FocusPickerProps) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [withEnded, setWithEnded] = useState(readShowEnded);
  // Cerrar y reabrir deprisa no debe dejar que una respuesta vieja pise la nueva.
  const request = useRef(0);

  async function fetchList() {
    const mine = ++request.current;
    setLoad({ status: "loading" });
    const result = await loadSessions().then(
      (sessions): Load => ({ status: "ready", sessions }),
      (): Load => ({
        status: "error",
        message: "No se pudo cargar la lista de sesiones.",
      }),
    );
    if (mine === request.current) setLoad(result);
  }

  function toggle() {
    if (open) {
      request.current++;
      setOpen(false);
      return;
    }
    setError(null);
    setOpen(true);
    void fetchList();
  }

  async function choose(petFocus: PetFocus) {
    if (saving) return;
    setSaving(true);
    const result = await save({ petFocus });
    setSaving(false);
    if (result.ok) {
      request.current++;
      setOpen(false);
    } else {
      setError(result.message);
    }
  }

  function toggleEnded() {
    const next = !withEnded;
    setWithEnded(next);
    writeShowEnded(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && open) {
      request.current++;
      setOpen(false);
    }
  }

  const visible =
    load.status === "ready"
      ? showEnded === "toggle" && withEnded
        ? load.sessions
        : hideEnded(load.sessions)
      : null;

  const option = (
    key: string,
    label: string,
    target: PetFocus,
    opts: { level: 0 | 1 | 2; note?: string | null; disabled?: boolean } = {
      level: 0,
    },
  ) => (
    <button
      key={key}
      type="button"
      className={styles.row}
      data-level={opts.level}
      aria-pressed={sameFocus(focus, target)}
      disabled={saving || opts.disabled}
      onClick={() => void choose(target)}
    >
      <span className={styles.name}>{label}</span>
      {opts.note && <span className={styles.note}>{opts.note}</span>}
    </button>
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: solo recoge Escape de los botones de dentro
    <div className={styles.root} data-layout={layout} onKeyDown={onKeyDown}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-label="Foco de la mascota"
        onClick={toggle}
      >
        {layout === "popover" && (
          <svg {...STROKE_ICON} className={styles.icon} aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
        <span className={styles.name}>{focusLabel(focus)}</span>
        {layout === "popover" ? (
          <svg
            {...STROKE_ICON}
            className={styles.chevron}
            data-testid="focus-chevron"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        ) : (
          <span aria-hidden="true">▾</span>
        )}
      </button>

      {open && (
        <fieldset className={styles.list} aria-label="Foco de la mascota">
          {option("auto", "Automático", { kind: "auto" })}
          {load.status === "loading" && (
            <span className={styles.hint}>Buscando sesiones…</span>
          )}
          {load.status === "error" && (
            <span className={styles.hint}>{load.message}</span>
          )}
          {visible && visible.repos.length === 0 && (
            <span className={styles.hint}>
              Aún no hay sesiones. Abre Claude Code en un repo.
            </span>
          )}
          {visible?.repos.map((repo) => (
            <div key={repo.repoRoot} className={styles.group}>
              {option(
                repo.repoRoot,
                repo.name,
                { kind: "repo", repoRoot: repo.repoRoot },
                { level: 0 },
              )}
              {repo.worktrees.map((wt) => (
                <div key={wt.worktree} className={styles.group}>
                  {option(
                    wt.worktree,
                    wt.name,
                    { kind: "worktree", worktree: wt.worktree },
                    { level: 1, note: wt.branch },
                  )}
                  {wt.sessions.map((s) =>
                    option(
                      s.sessionId,
                      `${STATE_TITLE[s.state]} · ${s.sessionId.slice(0, 6)}`,
                      {
                        kind: "session",
                        sessionId: s.sessionId,
                        worktree: wt.worktree,
                      },
                      {
                        level: 2,
                        // Un foco en una sesión muerta volvería a `auto` al momento.
                        disabled: !s.alive,
                        note: s.alive
                          ? `hace ${formatElapsed(s.lastEventAt, now)}`
                          : "terminada",
                      },
                    ),
                  )}
                </div>
              ))}
            </div>
          ))}
          {showEnded === "toggle" && (
            <button
              type="button"
              role="switch"
              className={styles.switch}
              aria-checked={withEnded}
              onClick={toggleEnded}
            >
              <span className={styles.name}>Mostrar terminadas</span>
              <span className={styles.track} aria-hidden="true" />
            </button>
          )}
          {error && (
            <span className={styles.error} role="alert">
              {error}
            </span>
          )}
        </fieldset>
      )}
    </div>
  );
}
