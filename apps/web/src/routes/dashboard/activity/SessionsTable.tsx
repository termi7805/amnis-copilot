import type { ActivitySession } from "@amnis/shared";
import { formatMinutes, isOngoing } from "../../../lib/activity.ts";
import { formatTokens, formatUsd } from "../../../lib/history.ts";
import styles from "./ActivityView.module.css";
import { hhmm } from "./DayTimeline.tsx";

/** `fetchedAt` solo en "Hoy": ayer nada sigue en curso. */
export function SessionsTable({
  sessions,
  fetchedAt,
}: {
  sessions: ActivitySession[];
  fetchedAt: number | null;
}) {
  if (sessions.length === 0) {
    return <p className={styles.empty}>Sin sesiones este día.</p>;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Proyecto</th>
            <th>Inicio</th>
            <th className={styles.n}>Duración</th>
            <th className={styles.n}>Activo</th>
            <th className={styles.n}>Tokens</th>
            <th className={styles.n}>Equiv.</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {[...sessions].reverse().map((s) => {
            const live = fetchedAt !== null && isOngoing(s, fetchedAt);
            return (
              <tr key={s.sessionId}>
                <td>
                  <div className={styles.proj}>
                    {s.project ?? "sin proyecto"}
                  </div>
                  {s.gitBranch && (
                    <div className={styles.branch}>{s.gitBranch}</div>
                  )}
                </td>
                <td className={styles.n}>{hhmm(Date.parse(s.start))}</td>
                <td className={styles.n}>
                  {formatMinutes(
                    (Date.parse(s.end) - Date.parse(s.start)) / 60_000,
                  )}
                </td>
                <td className={styles.n}>{formatMinutes(s.activeMinutes)}</td>
                <td className={styles.n}>{formatTokens(s.tokens)}</td>
                <td className={styles.n}>{formatUsd(s.costUsd)}</td>
                <td>
                  <span className={live ? styles.pillLive : styles.pill}>
                    {live ? "en curso" : "terminada"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
