import type { ConnectionStatus } from "../../api/useAmnisStream.ts";
import styles from "./PanelHeader.module.css";

export type PanelId = "quota" | "media";

/** Mismos tonos que llevaba el `statusDot` que se quitó de `PetWindow.tsx`:
 * vive dentro del panel desplegado, no flotando sobre la mascota. */
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
  /** Sin esto no hay pestañas: el panel se puede usar suelto. */
  onSelect?: (panel: PanelId) => void;
}

/**
 * Cabecera común de los paneles de la ventana flotante (#57). Las pestañas
 * cambian de panel sin pasar por el plegado: abrir uno cierra el otro, nunca
 * hay dos a la vez.
 */
export function PanelHeader({ status, active, onSelect }: PanelHeaderProps) {
  return (
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
  );
}
