import type { ActivityResponse } from "@amnis/shared";
import { useTranslation } from "react-i18next";
import { dateFormat } from "../../../i18n/index.ts";
import { GROUP_COLOR, recentSegments } from "../../../lib/nowCards.ts";
import { stateTitle } from "../../../lib/Pet/Pet.tsx";
import styles from "./NowCards.module.css";

const hhmm = (date: Date) =>
  dateFormat({ hour: "2-digit", minute: "2-digit" }).format(date);

/** Los últimos tramos del día: qué hizo Amnis y en qué proyecto. */
export function RecentEvents({
  activity,
}: {
  activity: ActivityResponse | null;
}) {
  const { t } = useTranslation();
  const projects = new Map(
    (activity?.sessions ?? []).map((s) => [s.sessionId, s.project]),
  );
  const recent = recentSegments(activity?.segments ?? []);

  return (
    <article className={styles.card} data-testid="recent-events">
      <div className={styles.row}>
        <h2>{t("now.recent.title")}</h2>
        <a className={styles.link} href="#actividad">
          {t("now.recent.seeDay")}
        </a>
      </div>
      {recent.length === 0 ? (
        <small className={styles.note}>{t("now.recent.empty")}</small>
      ) : (
        <ul className={styles.feed}>
          {recent.map((s) => {
            const project = projects.get(s.sessionId);
            return (
              <li key={`${s.sessionId}:${s.start}`}>
                <time dateTime={s.start}>{hhmm(new Date(s.start))}</time>
                <i
                  className={styles.sw}
                  style={{ background: GROUP_COLOR[s.group] }}
                />
                <span className={styles.what}>
                  {stateTitle(s.state)}
                  {project && <em> · {project}</em>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
