import type { ActivityResponse } from "@amnis/shared";
import { useTranslation } from "react-i18next";
import { dateFormat } from "../../../i18n/index.ts";
import { formatElapsed } from "../../../lib/countdown.ts";
import { lastWaiting } from "../../../lib/nowCards.ts";
import styles from "./NowCards.module.css";

const hhmm = (date: Date) =>
  dateFormat({ hour: "2-digit", minute: "2-digit" }).format(date);

/** Cuánto tiempo te esperó Amnis hoy en «esperando permiso». */
export function WaitingCard({
  activity,
}: {
  activity: ActivityResponse | null;
}) {
  const { t } = useTranslation();
  const waiting = activity?.waiting ?? { minutes: 0, count: 0 };
  const last = activity ? lastWaiting(activity.segments) : null;
  return (
    <article className={styles.card} data-testid="card-waiting">
      <div className={styles.row}>
        <h2>{t("now.waiting.title")}</h2>
        <a className={styles.link} href="#actividad">
          {t("common.views.actividad")}
        </a>
      </div>
      <div className={styles.row}>
        <span className={styles.pct} data-testid="waiting-minutes">
          {Math.round(waiting.minutes)}
          <small> min</small>
        </span>
        <small className={styles.note} data-testid="waiting-count">
          {t("now.waiting.permissions", { count: waiting.count })}
        </small>
      </div>
      {last && (
        <small className={styles.mono}>
          {t("now.waiting.last", {
            time: hhmm(new Date(last.start)),
            duration: formatElapsed(last.start, new Date(last.end)),
          })}
        </small>
      )}
      <small className={styles.note}>{t("now.waiting.note")}</small>
    </article>
  );
}
