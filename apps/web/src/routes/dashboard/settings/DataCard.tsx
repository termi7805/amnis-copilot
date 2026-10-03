import { useEffect, useState } from "react";
import type { ActionResult } from "../../../api/actions.ts";
import { rebuildCache } from "../../../api/health.ts";
import type { AmnisStream } from "../../../api/useAmnisStream.ts";
import styles from "./SettingsView.module.css";

type Phase =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "running" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export interface DataCardProps {
  /** Fin de la última reconstrucción, tal como llega por SSE. */
  rebuild: AmnisStream["rebuild"];
  start?: () => Promise<ActionResult>;
}

/**
 * Reconstruir la caché pide confirmación en la propia página (no `confirm()`:
 * bloquea el hilo y no se puede estilar ni testear). La ruta responde 202 y
 * avisa del final por el evento SSE `rebuild`: hasta que `rebuild.seq` cambia,
 * la tarjeta sigue "reconstruyendo".
 */
export function DataCard({ rebuild, start = rebuildCache }: DataCardProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [seenSeq, setSeenSeq] = useState(rebuild?.seq ?? 0);

  // El evento que ya estaba al montar no es de esta reconstrucción.
  useEffect(() => {
    if (!rebuild || rebuild.seq === seenSeq) return;
    setSeenSeq(rebuild.seq);
    setPhase((current) =>
      current.kind !== "running"
        ? current
        : rebuild.event.status === "done"
          ? { kind: "done" }
          : {
              kind: "error",
              message: rebuild.event.error ?? "La reconstrucción falló.",
            },
    );
  }, [rebuild, seenSeq]);

  async function confirm() {
    setPhase({ kind: "running" });
    const result = await start();
    if (!result.ok) setPhase({ kind: "error", message: result.message });
  }

  const running = phase.kind === "running";

  return (
    <section className={styles.card} aria-labelledby="data-title">
      <div className={styles.cardHead}>
        <h2 id="data-title">Datos</h2>
      </div>
      <p className={styles.text}>
        La base de datos es una caché de tus transcripts. Reconstruirla vuelve a
        leer los que sigan en disco y corrige lo que ya había, sin borrar nada:
        la serie de cuota, la actividad de Amnis y tus ajustes se conservan.
      </p>
      <button
        type="button"
        className={`${styles.btn} ${styles.danger}`}
        disabled={running || phase.kind === "confirming"}
        aria-busy={running}
        onClick={() => setPhase({ kind: "confirming" })}
      >
        {running ? "Reconstruyendo…" : "Reconstruir la caché"}
      </button>
      {phase.kind === "confirming" && (
        <div className={styles.confirm}>
          <p>Tarda unos segundos; Amnis sigue funcionando mientras tanto.</p>
          <button
            type="button"
            className={`${styles.btn} ${styles.danger}`}
            onClick={confirm}
          >
            Reconstruir
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={() => setPhase({ kind: "idle" })}
          >
            Cancelar
          </button>
        </div>
      )}
      {phase.kind === "done" && (
        <p role="status" className={styles.notice}>
          Caché reconstruida.
        </p>
      )}
      {phase.kind === "error" && (
        <p role="alert" className={styles.error}>
          {phase.message}
        </p>
      )}
    </section>
  );
}
