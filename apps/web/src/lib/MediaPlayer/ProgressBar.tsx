import type { MediaSnapshot } from "@amnis/shared";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import styles from "./MediaPlayer.module.css";
import {
  type InterpolationOptions,
  type ProgressAnchor,
  useInterpolatedProgress,
  usePrefersReducedMotion,
} from "./useInterpolatedProgress.ts";

const KEY_STEP_MS = 5_000;

export function formatTrackTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * Un seek pedido: se pinta su destino hasta que llegue un snapshot medido
 * después de que el daemon lo confirmara, o la barra volvería atrás y
 * luego saltaría. `settledAt` es `Infinity` mientras sigue en vuelo.
 */
interface PendingSeek {
  progressMs: number;
  startedAt: number;
  settledAt: number;
}

export interface ProgressBarProps {
  media: MediaSnapshot;
  /** `true` si el daemon aceptó el seek. */
  onSeek: (positionMs: number) => Promise<boolean>;
  disabled?: boolean;
  clock?: InterpolationOptions["now"];
}

export function ProgressBar({
  media,
  onSeek,
  disabled = false,
  clock = Date.now,
}: ProgressBarProps) {
  const durationMs = media.track?.durationMs ?? 0;
  const reducedMotion = usePrefersReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragMs, setDragMs] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingSeek | null>(null);

  const measuredAtMs = Date.parse(media.measuredAt);
  const seekPending = pending !== null && measuredAtMs <= pending.settledAt;
  const anchor: ProgressAnchor =
    pending && seekPending
      ? {
          isPlaying: media.isPlaying,
          progressMs: pending.progressMs,
          measuredAtMs: pending.startedAt,
          durationMs,
        }
      : {
          isPlaying: media.isPlaying,
          progressMs: media.progressMs,
          measuredAtMs,
          durationMs,
        };
  // Los `media` entrantes cambian el ancla, pero mientras se arrastra se pinta
  // `dragMs`: el pulgar no salta bajo el dedo.
  const interpolated = useInterpolatedProgress(anchor, {
    now: clock,
    reducedMotion,
  });
  const position = dragMs ?? interpolated;

  if (!media.track || durationMs <= 0) return null;

  function msAt(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * durationMs);
  }

  async function seekTo(positionMs: number) {
    const startedAt = clock();
    setPending({ progressMs: positionMs, startedAt, settledAt: Infinity });
    const ok = await onSeek(positionMs);
    setPending(
      ok ? { progressMs: positionMs, startedAt, settledAt: clock() } : null,
    );
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragMs(msAt(e.clientX));
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragMs === null) return;
    setDragMs(msAt(e.clientX));
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (dragMs === null) return;
    const target = msAt(e.clientX);
    setDragMs(null);
    void seekTo(target);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const delta =
      e.key === "ArrowRight"
        ? KEY_STEP_MS
        : e.key === "ArrowLeft"
          ? -KEY_STEP_MS
          : 0;
    if (delta === 0) return;
    e.preventDefault();
    void seekTo(Math.min(durationMs, Math.max(0, position + delta)));
  }

  return (
    <div className={styles.progress}>
      <span className={styles.time}>{formatTrackTime(position)}</span>
      <div
        ref={trackRef}
        className={styles.progressTrack}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Progreso de la canción"
        aria-valuemin={0}
        aria-valuemax={durationMs}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${formatTrackTime(position)} de ${formatTrackTime(durationMs)}`}
        aria-disabled={disabled}
        data-dragging={dragMs !== null}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDragMs(null)}
        onKeyDown={onKeyDown}
      >
        <div
          className={styles.progressFill}
          style={{ width: `${(position / durationMs) * 100}%` }}
        />
      </div>
      <span className={styles.time}>{formatTrackTime(durationMs)}</span>
    </div>
  );
}
