import type { RepairHooksResponse } from "@amnis/shared";
import { useState } from "react";
import type { ActionResult } from "../../api/actions.ts";
import { repairHooks } from "../../api/health.ts";
import styles from "./HooksAlert.module.css";

export interface HooksAlertProps {
  /** Se llama tras reparar, para volver a pedir la salud. */
  onRepaired: () => void;
  repair?: () => Promise<ActionResult<RepairHooksResponse>>;
}

/**
 * Aviso del panel desplegado cuando faltan los hooks de Claude Code (#132).
 * Repara con la misma ruta que «Reparar hooks» de Ajustes.
 */
export function HooksAlert({
  onRepaired,
  repair = repairHooks,
}: HooksAlertProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const result = await repair();
    setBusy(false);
    if (result.ok) onRepaired();
    else setError(result.message);
  }

  return (
    <div className={styles.alert} role="alert">
      <div className={styles.row}>
        <span className={styles.text}>Claude Code no está conectado</span>
        <button
          type="button"
          className={styles.btn}
          disabled={busy}
          // La ventana alterna plegado/desplegado con el clic de toda ella
          // (PetWindow.tsx): sin esto el botón también la plegaría.
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={run}
        >
          {busy ? "Reparando…" : "Reparar"}
        </button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
