import type { MediaSnapshot } from "@amnis/shared";
import { fetchMediaDevices, sendMediaCommand } from "../../api/media.ts";
import type { ConnectionStatus } from "../../api/useAmnisStream.ts";
import { MediaPlayer } from "../../lib/MediaPlayer/MediaPlayer.tsx";
import { PanelHeader, type PanelId } from "./PanelHeader.tsx";

export interface MediaPanelProps {
  media: MediaSnapshot | null;
  status: ConnectionStatus;
  onSelectPanel: (panel: PanelId) => void;
}

/** El aviso de "alguien mira" al recuperar el foco ya lo manda `useAmnisStream`. */
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
