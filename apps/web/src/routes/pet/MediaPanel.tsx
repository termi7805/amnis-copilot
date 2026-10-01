import type { MediaSnapshot } from "@amnis/shared";
import { fetchMediaDevices, sendMediaCommand } from "../../api/media.ts";
import type { ConnectionStatus } from "../../api/useAmnisStream.ts";
import { MediaPlayer } from "../../lib/MediaPlayer/MediaPlayer.tsx";
import { PanelHeader, type PanelId } from "./PanelHeader.tsx";

export interface MediaPanelProps {
  /** `null` mientras no ha llegado el primer `hello`: el reproductor pinta
   * entonces "Amnis no responde". */
  media: MediaSnapshot | null;
  status: ConnectionStatus;
  onSelectPanel: (panel: PanelId) => void;
}

/**
 * Panel de música de la ventana flotante (#57): la cabecera común y el
 * reproductor, que no sabe en qué ventana vive. El aviso de "alguien mira"
 * al recuperar el foco ya lo manda `useAmnisStream`, no hace falta aquí.
 */
export function MediaPanel({ media, status, onSelectPanel }: MediaPanelProps) {
  return (
    <div>
      <PanelHeader status={status} active="media" onSelect={onSelectPanel} />
      <MediaPlayer
        media={media}
        onCommand={sendMediaCommand}
        loadDevices={fetchMediaDevices}
      />
    </div>
  );
}
