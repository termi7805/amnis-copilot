import type { MediaSnapshot } from "@amnis/shared";
import type { MediaCommand } from "../../api/media.ts";
import styles from "./MediaPlayer.module.css";

type RepeatMode = MediaSnapshot["repeat"];

/** `off → context → track → off`: un toggle booleano perdería `track`. */
export function nextRepeat(mode: RepeatMode): RepeatMode {
  switch (mode) {
    case "off":
      return "context";
    case "context":
      return "track";
    case "track":
      return "off";
  }
}

const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: "Repetir: no",
  context: "Repetir: lista",
  track: "Repetir: canción",
};

export interface ModeTogglesProps {
  shuffle: boolean;
  repeat: RepeatMode;
  disabled?: boolean;
  onCommand: (command: MediaCommand) => unknown;
}

/**
 * Shuffle y repeat. No guardan estado: pintan lo que dice el último `media`,
 * así que tras pulsar el botón no cambia hasta que Spotify confirma. Un
 * optimista local podría divergir de lo que Spotify realmente aplicó.
 */
export function ModeToggles({
  shuffle,
  repeat,
  disabled = false,
  onCommand,
}: ModeTogglesProps) {
  return (
    <>
      <button
        type="button"
        className={styles.control}
        data-toggle="true"
        aria-pressed={shuffle}
        aria-label="Aleatorio"
        disabled={disabled}
        onClick={() => onCommand({ kind: "shuffle", state: !shuffle })}
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.control}
        data-toggle="true"
        data-mode={repeat}
        aria-pressed={repeat !== "off"}
        aria-label={REPEAT_LABEL[repeat]}
        disabled={disabled}
        onClick={() => onCommand({ kind: "repeat", mode: nextRepeat(repeat) })}
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />
          {repeat === "track" && (
            <text
              x="12"
              y="15.5"
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill="currentColor"
              stroke="none"
              data-testid="repeat-one"
            >
              1
            </text>
          )}
        </svg>
      </button>
    </>
  );
}
