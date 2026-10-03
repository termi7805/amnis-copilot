import { formatUntil } from "../../../lib/countdown.ts";
import { weeklyPace } from "../../../lib/nowCards.ts";
import styles from "./NowCards.module.css";

const RESET = new Intl.DateTimeFormat("es-ES", {
  weekday: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const VERDICT = {
  below: "vas por debajo del ritmo lineal",
  on: "vas al ritmo lineal",
  above: "vas por encima del ritmo lineal",
};

/**
 * Lo común de las tarjetas de ventana semanal (7 d y límites por modelo):
 * `%`, reset, barra con la marca del ritmo lineal y su lectura.
 */
export function LimitMeter({
  utilization,
  resetsAt,
  now,
  color,
}: {
  utilization: number;
  resetsAt: string | null;
  now: Date;
  /** Color de la barra; por defecto el de acento. */
  color?: string;
}) {
  const pace = weeklyPace(utilization, resetsAt, now);
  const until = formatUntil(resetsAt, now);
  return (
    <>
      <div className={styles.row}>
        <span className={styles.pct} data-testid="limit-value">
          {Math.round(utilization)}
          <small>%</small>
        </span>
        {resetsAt && (
          <small
            className={styles.note}
            title={until ? `quedan ${until}` : undefined}
          >
            {RESET.format(new Date(resetsAt)).replace(",", " ·")}
          </small>
        )}
      </div>
      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{
            width: `${Math.min(100, utilization)}%`,
            ...(color ? { background: color } : {}),
          }}
        />
        {pace && (
          <div
            className={styles.now}
            data-testid="mark-pace"
            style={{ left: `${pace.elapsedPct}%` }}
          />
        )}
      </div>
      {pace && (
        <small className={styles.note}>
          Día {pace.day} de 7: {VERDICT[pace.verdict]}.
        </small>
      )}
    </>
  );
}
