import type { ActivityResponse } from "@amnis/shared";
import { GROUP_COLOR, recentSegments } from "../../../lib/nowCards.ts";
import { STATE_TITLE } from "../../../lib/Pet/Pet.tsx";
import styles from "./NowCards.module.css";

const HHMM = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
});

/** Los últimos tramos del día: qué hizo Amnis y en qué proyecto. */
export function RecentEvents({
  activity,
}: {
  activity: ActivityResponse | null;
}) {
  const projects = new Map(
    (activity?.sessions ?? []).map((s) => [s.sessionId, s.project]),
  );
  const recent = recentSegments(activity?.segments ?? []);

  return (
    <article className={styles.card} data-testid="recent-events">
      <div className={styles.row}>
        <h2>Últimos eventos</h2>
        <a className={styles.link} href="#actividad">
          Ver el día
        </a>
      </div>
      {recent.length === 0 ? (
        <small className={styles.note}>Sin actividad de agentes hoy.</small>
      ) : (
        <ul className={styles.feed}>
          {recent.map((s) => {
            const project = projects.get(s.sessionId);
            return (
              <li key={`${s.sessionId}:${s.start}`}>
                <time dateTime={s.start}>{HHMM.format(new Date(s.start))}</time>
                <i
                  className={styles.sw}
                  style={{ background: GROUP_COLOR[s.group] }}
                />
                <span className={styles.what}>
                  {STATE_TITLE[s.state]}
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
