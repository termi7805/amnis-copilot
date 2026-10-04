import type { PetFocus } from "@amnis/shared";
import type { ConnectionStatus } from "../../api/useAmnisStream.ts";
import { FocusPicker } from "../../lib/FocusPicker/FocusPicker.tsx";
import styles from "./PanelHeader.module.css";

export type PanelId = "quota" | "media";

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: "#1FB98C",
  reconnecting: "#e0b84a",
  offline: "#b0b0b0",
};

const TABS: { id: PanelId; label: string }[] = [
  { id: "quota", label: "Cuota" },
  { id: "media", label: "Música" },
];

export interface PanelHeaderProps {
  status: ConnectionStatus;
  active: PanelId;
  onSelect?: (panel: PanelId) => void;
  /** Con foco, una fila bajo la cabecera para cambiarlo (#111). */
  focus?: PetFocus;
  now?: Date;
}

/** Abrir una pestaña cierra el otro panel: nunca hay dos a la vez. */
export function PanelHeader({
  status,
  active,
  onSelect,
  focus,
  now,
}: PanelHeaderProps) {
  return (
    <>
      <div className={styles.header}>
        <div
          className={styles.statusDot}
          style={{ background: STATUS_COLOR[status] }}
        />
        <span className={styles.wordmark}>AMNIS</span>
        {onSelect && (
          <div className={styles.tabs} role="tablist" aria-label="Panel">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={active === id}
                // La ventana alterna plegado/desplegado con el clic de toda
                // ella (PetWindow.tsx): sin esto cada pestaña también la plegaría.
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={() => onSelect(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {focus && now && (
        // Como las pestañas: abrir el selector no debe plegar la ventana.
        <div
          className={styles.focusRow}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <FocusPicker focus={focus} now={now} />
        </div>
      )}
    </>
  );
}
