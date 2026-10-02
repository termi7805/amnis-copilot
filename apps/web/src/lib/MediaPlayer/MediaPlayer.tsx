import type { MediaSnapshot } from "@amnis/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type {
  MediaCommand,
  MediaCommandResult,
  MediaDevicesResult,
} from "../../api/media.ts";
import { DeviceSelector } from "./DeviceSelector.tsx";
import styles from "./MediaPlayer.module.css";
import { ModeToggles } from "./ModeToggles.tsx";
import { ProgressBar } from "./ProgressBar.tsx";

/** Un error de una orden se ve unos segundos y se va solo. */
const ERROR_MS = 6_000;

const LOGIN_COMMAND = "amnis spotify login --client-id <tu id>";

export interface MediaPlayerProps {
  /** `null` = sin datos del daemon (caído, o aún sin el primer `hello`). */
  media: MediaSnapshot | null;
  onCommand: (command: MediaCommand) => Promise<MediaCommandResult>;
  loadDevices: () => Promise<MediaDevicesResult>;
  /** `wide`: portada grande y lista de dispositivos siempre visible. */
  layout?: "compact" | "wide";
}

/** Cada uno se ve distinto: un panel en blanco no distingue "no has hecho
 * login" de "no suena nada" de "el daemon no responde". */
type PlayerState =
  | "ok"
  | "no-track"
  | "not-configured"
  | "not-logged-in"
  | "no-device"
  | "unavailable"
  | "disconnected";

function stateOf(media: MediaSnapshot | null): PlayerState {
  if (!media) return "disconnected";
  if (media.status === "ok") return media.track ? "ok" : "no-track";
  return media.status;
}

interface ErrorInfo {
  message: string;
  remedy?: string;
}

/**
 * Reproductor de Spotify compartido entre la ventana de la mascota y el
 * dashboard (#53). Mismo criterio que `<Pet>` (docs/STACK.md §2): no sabe en
 * qué ventana vive ni de dónde salen los datos — recibe un `MediaSnapshot` y
 * una función para mandar órdenes, y las envolturas lo colocan.
 *
 * Todo lo que sale mal (un 409 por no haber dispositivo, un 403 sin Premium,
 * una caída de red) llega por el mismo `onCommand` y se ve aquí mismo, no en
 * la consola.
 */
export function MediaPlayer({
  media,
  onCommand,
  loadDevices,
  layout = "compact",
}: MediaPlayerProps) {
  const state = stateOf(media);
  const status = media?.status ?? null;

  const [error, setError] = useState<ErrorInfo | null>(null);
  const [busy, setBusy] = useState(false);
  // `status` en el que se pulsó "Conectar": el aviso de "autoriza en el
  // navegador" dura mientras siga siendo el mismo.
  const [authorizingAt, setAuthorizingAt] = useState<string | null>(null);

  // Una orden duplicada mientras la anterior no ha vuelto es justo lo que
  // Spotify rechaza con un 403 ("Restriction violated" al pausar lo
  // pausado, #52): el guardia síncrono cubre dos clics antes de que React
  // pinte el botón deshabilitado.
  const inFlight = useRef(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(errorTimer.current), []);

  // Derivado durante el render (no en un efecto): en cuanto el estado del
  // daemon cambia, el aviso deja de aplicar y no reaparece si luego vuelve
  // al mismo.
  if (authorizingAt !== null && authorizingAt !== status) {
    setAuthorizingAt(null);
  }

  async function run(command: MediaCommand): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    clearTimeout(errorTimer.current);

    let result: MediaCommandResult;
    try {
      result = await onCommand(command);
    } catch {
      result = { ok: false, message: "No se pudo enviar la orden." };
    }

    inFlight.current = false;
    setBusy(false);
    if (result.ok) {
      if (command === "connect") setAuthorizingAt(status);
      return true;
    }
    setError({
      message: result.message,
      ...(result.remedy !== undefined && { remedy: result.remedy }),
    });
    errorTimer.current = setTimeout(() => setError(null), ERROR_MS);
    return false;
  }

  return (
    // Cortar los eventos de puntero aquí: la ventana de la mascota alterna
    // plegado/desplegado con el clic de toda ella (PetWindow.tsx), y sin
    // esto cada botón del reproductor también la plegaría.
    <section
      className={styles.root}
      data-state={state}
      data-layout={layout}
      aria-label="Reproductor de Spotify"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {state === "disconnected" && (
        <Empty title="Amnis no responde">
          Comprueba que el daemon está en marcha.
        </Empty>
      )}

      {state === "not-configured" && (
        <Empty title="Spotify sin configurar">
          Registra tu app en el panel de desarrolladores de Spotify y ejecuta:
          <code className={styles.command}>{LOGIN_COMMAND}</code>
        </Empty>
      )}

      {state === "not-logged-in" && (
        <Empty title="Spotify desconectado">
          <button
            type="button"
            className={styles.connect}
            onClick={() => run("connect")}
            disabled={busy}
          >
            Conectar Spotify
          </button>
          {authorizingAt !== null && (
            <span className={styles.hint}>Autoriza en el navegador…</span>
          )}
        </Empty>
      )}

      {state === "no-device" && (
        <Empty title="Abre Spotify en algún dispositivo">
          Cuando empiece a sonar, aparecerá aquí.
        </Empty>
      )}

      {state === "unavailable" && (
        <Empty title="Spotify no responde">Reintentando…</Empty>
      )}

      {(state === "ok" || state === "no-track") && media && (
        <Player media={media} busy={busy} run={run} />
      )}

      {(state === "ok" || state === "no-track" || state === "no-device") && (
        <DeviceSelector
          current={media?.device ?? null}
          loadDevices={loadDevices}
          onTransfer={(deviceId) => run({ kind: "transfer", deviceId })}
          disabled={busy}
          alwaysOpen={layout === "wide"}
        />
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error.message}
          {error.remedy && (
            <code className={styles.command}>{error.remedy}</code>
          )}
        </p>
      )}
    </section>
  );
}

function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyTitle}>{title}</span>
      {children && <span className={styles.hint}>{children}</span>}
    </div>
  );
}

function Player({
  media,
  busy,
  run,
}: {
  media: MediaSnapshot;
  busy: boolean;
  run: (command: MediaCommand) => Promise<boolean>;
}) {
  const { track, isPlaying } = media;
  return (
    <>
      <div className={styles.player}>
        {track?.imageUrl ? (
          // Portada directa del CDN de Spotify (`i.scdn.co`). Hoy el CSP de
          // Tauri es `null` y funciona; si algún día se endurece, hay que
          // permitir ese origen en `img-src`.
          <img
            className={styles.cover}
            src={track.imageUrl}
            alt={track.album ? `Portada de ${track.album}` : "Portada"}
          />
        ) : (
          <div className={styles.cover} data-empty="true" aria-hidden="true" />
        )}

        <div className={styles.info}>
          {track ? (
            <>
              <span className={styles.title} title={track.title}>
                {track.title}
              </span>
              <span className={styles.artists}>{track.artists.join(", ")}</span>
            </>
          ) : (
            <span className={styles.title}>Sin información de la pista</span>
          )}

          <div className={styles.controls}>
            <button
              type="button"
              className={styles.control}
              onClick={() => run("previous")}
              disabled={busy}
              aria-label="Anterior"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path d="M6 5h2v14H6zM20 5v14L9 12z" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.control}
              data-primary="true"
              onClick={() => run(isPlaying ? "pause" : "play")}
              disabled={busy}
              aria-label={isPlaying ? "Pausar" : "Reproducir"}
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path
                  d={isPlaying ? "M6 4h4v16H6zM14 4h4v16h-4z" : "M7 4v16l13-8z"}
                  fill="currentColor"
                />
              </svg>
            </button>
            <button
              type="button"
              className={styles.control}
              onClick={() => run("next")}
              disabled={busy}
              aria-label="Siguiente"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path d="M16 5h2v14h-2zM4 5v14l11-7z" fill="currentColor" />
              </svg>
            </button>
            <span className={styles.controlGap} aria-hidden="true" />
            <ModeToggles
              shuffle={media.shuffle}
              repeat={media.repeat}
              disabled={busy}
              onCommand={run}
            />
          </div>
        </div>
      </div>
      <ProgressBar
        media={media}
        disabled={busy}
        onSeek={(positionMs) => run({ kind: "seek", positionMs })}
      />
    </>
  );
}
