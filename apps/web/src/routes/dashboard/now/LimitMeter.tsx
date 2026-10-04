import { useTranslation } from "react-i18next";
import { dateFormat } from "../../../i18n/index.ts";
import { formatUntil } from "../../../lib/countdown.ts";
import { weeklyPace } from "../../../lib/nowCards.ts";
import styles from "./NowCards.module.css";

const RESET: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
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
  const { t } = useTranslation();
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
            title={
              until ? t("now.limit.left", { countdown: until }) : undefined
            }
          >
            {dateFormat(RESET).format(new Date(resetsAt)).replace(",", " ·")}
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
          {t("now.limit.pace", {
            day: pace.day,
            verdict: t(`now.limit.${pace.verdict}`),
          })}
        </small>
      )}
    </>
  );
}
