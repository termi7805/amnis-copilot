import type { ActivityResponse } from "@amnis/shared";
import { formatElapsed } from "../../../lib/countdown.ts";
import { lastWaiting } from "../../../lib/nowCards.ts";
import styles from "./NowCards.module.css";

const HHMM = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
});

/** Cuánto tiempo te esperó Amnis hoy en «esperando permiso». */
export function WaitingCard({
  activity,
}: {
  activity: ActivityResponse | null;
}) {
  const waiting = activity?.waiting ?? { minutes: 0, count: 0 };
  const last = activity ? lastWaiting(activity.segments) : null;
  return (
    <article className={styles.card} data-testid="card-waiting">
      <div className={styles.row}>
        <h2>Te esperó</h2>
        <a className={styles.link} href="#actividad">
          Actividad
        </a>
      </div>
      <div className={styles.row}>
        <span className={styles.pct} data-testid="waiting-minutes">
          {Math.round(waiting.minutes)}
          <small> min</small>
        </span>
        <small className={styles.note} data-testid="waiting-count">
          {waiting.count} {waiting.count === 1 ? "permiso" : "permisos"}
        </small>
      </div>
      {last && (
        <small className={styles.mono}>
          último a las {HHMM.format(new Date(last.start))} ·{" "}
          {formatElapsed(last.start, new Date(last.end))}
        </small>
      )}
      <small className={styles.note}>
        Tiempo con Amnis en «esperando permiso».
      </small>
    </article>
  );
}
