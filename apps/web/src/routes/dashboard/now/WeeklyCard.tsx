import type { QuotaSnapshot } from "@amnis/shared";
import { originColor } from "../../../lib/nowCards.ts";
import { LimitMeter } from "./LimitMeter.tsx";
import styles from "./NowCards.module.css";

/**
 * La ventana de 7 d con el reparto por origen que reporta Anthropic. Sin
 * endpoint no hay dato semanal (la estimación local solo cubre 5 h): se dice
 * en vez de pintar un 0 %.
 */
export function WeeklyCard({
  quota,
  now,
}: {
  quota: QuotaSnapshot;
  now: Date;
}) {
  const week = quota.authoritative?.sevenDay ?? null;
  const rows = quota.authoritative?.weeklyBreakdown?.rows ?? [];

  return (
    <article className={styles.card} data-testid="card-weekly">
      <div className={styles.row}>
        <h2>Semana · 7 d</h2>
        <span className={styles.pill}>{week ? "real" : "sin endpoint"}</span>
      </div>
      {week ? (
        <LimitMeter
          utilization={week.utilization}
          resetsAt={week.resetsAt}
          now={now}
        />
      ) : (
        <small className={styles.note}>
          Sin el endpoint de Anthropic no hay dato de la semana.
        </small>
      )}
      {rows.length > 0 && (
        <div className={styles.origin} data-testid="origin">
          <div className={styles.originHead}>
            <span>De dónde sale</span>
            <span>según Anthropic</span>
          </div>
          <div className={styles.originBar}>
            {rows
              .filter((r) => r.percent > 0)
              .map((r) => (
                <i
                  key={r.key}
                  title={`${r.label}: ${r.percent} %`}
                  style={{ flex: r.percent, background: originColor(r.key) }}
                />
              ))}
          </div>
          <ul className={styles.originList}>
            {rows.map((r) => (
              <li key={r.key} data-zero={r.percent === 0 ? "" : undefined}>
                <i style={{ background: originColor(r.key) }} />
                <span>{r.label}</span>
                <b>{Math.round(r.percent)} %</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
