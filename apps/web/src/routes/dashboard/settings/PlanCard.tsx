import { PLANS, type StateResponse } from "@amnis/shared";
import { useState } from "react";
import {
  type SaveSettingsResult,
  saveSettings,
} from "../../../api/settings.ts";
import { formatUsd } from "../../../lib/history.ts";
import styles from "./SettingsView.module.css";

export interface PlanCardProps {
  state: StateResponse | null;
  save?: (partial: { plan: string | null }) => Promise<SaveSettingsResult>;
}

/**
 * El plan de la suscripción. Con plan detectado de las credenciales es un dato
 * de solo lectura ("automático"): lo detectado siempre gana a lo manual, así
 * que un selector ahí prometería algo que no se cumple (#84). El selector solo
 * aparece cuando no hay nada detectado.
 */
export function PlanCard({ state, save = saveSettings }: PlanCardProps) {
  const [error, setError] = useState<string | null>(null);
  const plan = state?.plan ?? null;
  const detected = plan?.source === "detected";

  async function choose(value: string) {
    const result = await save({ plan: value === "" ? null : value });
    setError(result.ok ? null : result.message);
  }

  return (
    <section className={styles.card} aria-labelledby="plan-title">
      <div className={styles.cardHead}>
        <h2 id="plan-title">Plan</h2>
      </div>
      {detected ? (
        <div className={styles.planRow}>
          <div>
            <div className={styles.planName}>Claude {plan.label}</div>
            <p className={styles.muted}>
              {formatUsd(plan.monthlyUsd)} al mes · detectado de tu sesión de
              Claude
            </p>
          </div>
          <span className={styles.pill}>automático</span>
        </div>
      ) : (
        <>
          <p className={styles.noteStrip}>
            No hemos podido detectar tu plan desde la sesión de Claude. Elígelo
            para poder comparar con el equivalente de API.
          </p>
          <label className={styles.field}>
            Tu suscripción
            <select
              value={state?.settings.plan ?? ""}
              disabled={state === null}
              onChange={(e) => choose(e.target.value)}
            >
              <option value="">Elige tu plan…</option>
              {Object.entries(PLANS).map(([id, { label, monthlyUsd }]) => (
                <option key={id} value={id}>
                  {label} · {formatUsd(monthlyUsd)} al mes
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </>
      )}
      <p className={`${styles.muted} ${styles.footnote}`}>
        Se usa para comparar con el equivalente de API.
      </p>
    </section>
  );
}
