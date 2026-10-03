import type { ActivityResponse } from "@amnis/shared";
import type { TodayUsage } from "../../../api/usage.ts";
import { formatTokens, formatUsd } from "../../../lib/history.ts";
import styles from "./NowCards.module.css";

/**
 * Lo consumido hoy, siempre como equivalente de API: un `$14,80` suelto se
 * lee como un cargo y no lo es (DESIGN §2).
 */
export function TodayCard({
  usage,
  activity,
}: {
  usage: TodayUsage | null;
  activity: ActivityResponse | null;
}) {
  const sessions = activity?.sessions.length ?? 0;
  return (
    <article className={styles.card} data-testid="card-today">
      <div className={styles.row}>
        <h2>Hoy</h2>
        <a className={styles.link} href="#historico">
          Histórico
        </a>
      </div>
      <div className={styles.row}>
        <span className={styles.pct}>
          {usage ? formatUsd(usage.costUsd) : "—"}
        </span>
        <small className={styles.note}>equiv. API</small>
      </div>
      {usage && (
        <small className={styles.mono}>
          {formatTokens(usage.tokens)} tokens · {sessions}{" "}
          {sessions === 1 ? "sesión" : "sesiones"}
        </small>
      )}
      <small className={styles.note}>
        Lo que habría costado pagando la API. No es dinero gastado.
      </small>
    </article>
  );
}
