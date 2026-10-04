import type { PetFocus, SessionsResponse } from "@amnis/shared";
import { type KeyboardEvent, useRef, useState } from "react";
import { fetchSessions } from "../../api/sessions.ts";
import { type SaveSettingsResult, saveSettings } from "../../api/settings.ts";
import { formatElapsed } from "../countdown.ts";
import { STATE_TITLE } from "../Pet/Pet.tsx";
import styles from "./FocusPicker.module.css";
import { focusLabel, sameFocus } from "./focus.ts";

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
  loadSessions = fetchSessions,
  save = saveSettings,
}: FocusPickerProps) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && open) {
      request.current++;
      setOpen(false);
    }
  }

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
        <span className={styles.name}>{focusLabel(focus)}</span>
        <span aria-hidden="true">▾</span>
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
          {load.status === "ready" && load.sessions.repos.length === 0 && (
            <span className={styles.hint}>
              Aún no hay sesiones. Abre Claude Code en un repo.
            </span>
          )}
          {load.status === "ready" &&
            load.sessions.repos.map((repo) => (
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
