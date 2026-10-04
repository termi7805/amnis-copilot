import type { PetFocus } from "@amnis/shared";
import { useTranslation } from "react-i18next";
import type { ConnectionStatus } from "../../api/useAmnisStream.ts";
import { FocusPicker } from "../../lib/FocusPicker/FocusPicker.tsx";
import styles from "./PanelHeader.module.css";
import { openDashboard } from "./useTauriWindow.ts";

export type PanelId = "quota" | "media";

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: "var(--ok)",
  reconnecting: "var(--warn-mark)",
  offline: "var(--ink-3)",
};

const TABS = [
  { id: "quota", label: "pet.window.quota" },
  { id: "media", label: "pet.window.music" },
] as const satisfies readonly { id: PanelId; label: string }[];

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
  const { t } = useTranslation();
  return (
    <>
      <div className={styles.header}>
        <div
          className={styles.statusDot}
          style={{ background: STATUS_COLOR[status] }}
        />
        <span className={styles.wordmark}>AMNIS</span>
        <div className={styles.actions}>
          {onSelect && (
            <div
              className={styles.tabs}
              role="tablist"
              aria-label={t("pet.window.panel")}
            >
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
                  {t(label)}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className={styles.openDashboard}
            aria-label={t("pet.window.openDashboard")}
            title={t("pet.window.openDashboard")}
            // Como las pestañas: abrir el dashboard no debe plegar la ventana.
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={openDashboard}
          >
            <svg
              viewBox="0 0 24 24"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="square"
              aria-hidden="true"
            >
              <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
            </svg>
          </button>
        </div>
      </div>
      {focus && now && (
        // Como las pestañas: abrir el selector no debe plegar la ventana.
        <div
          className={styles.focusRow}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <FocusPicker focus={focus} now={now} showEnded="never" />
        </div>
      )}
    </>
  );
}
