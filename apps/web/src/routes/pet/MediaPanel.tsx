import type { MediaSnapshot, MusicPrefs, PetSnapshot } from "@amnis/shared";
import { fetchMediaDevices, sendMediaCommand } from "../../api/media.ts";
import type { ConnectionStatus } from "../../api/useAmnisStream.ts";
import { MediaPlayer } from "../../lib/MediaPlayer/MediaPlayer.tsx";
import { ActivityRow } from "./ActivityRow.tsx";
import { PanelHeader, type PanelId } from "./PanelHeader.tsx";

export interface MediaPanelProps {
  /** `null` antes del primer `hello`: sin bicho, y el reproductor lo dice. */
  pet: PetSnapshot | null;
  resetsAt: string | null;
  now: Date;
  media: MediaSnapshot | null;
  status: ConnectionStatus;
  musicPrefs?: MusicPrefs;
  onSelectPanel: (panel: PanelId) => void;
}

/** El aviso de "alguien mira" al recuperar el foco ya lo manda `useAmnisStream`. */
export function MediaPanel({
  pet,
  resetsAt,
  now,
  media,
  status,
  musicPrefs,
  onSelectPanel,
}: MediaPanelProps) {
  return (
    <div>
      <PanelHeader
        status={status}
        active="media"
        onSelect={onSelectPanel}
        focus={pet?.focus}
        now={now}
      />
      {pet && (
        <ActivityRow
          pet={pet}
          status={status}
          resetsAt={resetsAt}
          now={now}
          musicPrefs={musicPrefs}
        />
      )}
      <MediaPlayer
        media={media}
        onCommand={sendMediaCommand}
        loadDevices={fetchMediaDevices}
      />
    </div>
  );
}
