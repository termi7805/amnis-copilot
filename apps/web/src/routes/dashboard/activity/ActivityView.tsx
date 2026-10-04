import type {
  ActivityHeatmapResponse,
  ActivityResponse,
  StateResponse,
} from "@amnis/shared";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchActivity, fetchHeatmap } from "../../../api/activity.ts";
import {
  dayKey,
  groupLabel,
  headline,
  stateRows,
  yesterday,
} from "../../../lib/activity.ts";
import styles from "./ActivityView.module.css";
import { DayTimeline } from "./DayTimeline.tsx";
import { HourHeatmap } from "./HourHeatmap.tsx";
import { SessionsTable } from "./SessionsTable.tsx";
import { StateBreakdown } from "./StateBreakdown.tsx";

type Day = "today" | "yesterday";

const REFRESH_MS = 60_000;

const LEGEND = [
  ["working", "var(--act-work)"],
  ["thinking", "var(--act-explore)"],
  ["waiting", "var(--act-wait)"],
  ["resting", "var(--act-idle)"],
] as const;

/**
 * Actividad (#94): qué hicieron los agentes, cuánto rato y cuánto te
 * esperaron. En "Hoy" se vuelve a pedir cuando cambia el estado de la
 * mascota (llega por el SSE que abre `Dashboard`) y cada minuto, para que
 * una sesión nueva añada su carril y la marca "ahora" avance.
 */
export function ActivityView({ state }: { state: StateResponse | null }) {
  const { t } = useTranslation();
  const [day, setDay] = useState<Day>("today");
  const [data, setData] = useState<{
    activity: ActivityResponse;
    fetchedAt: number;
  } | null>(null);
  const [heatmap, setHeatmap] = useState<ActivityHeatmapResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const refreshKey = day === "today" ? (state?.pet.since ?? "") : "";

  useEffect(() => {
    if (day !== "today") return;
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, [day]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey y tick solo disparan el refetch
  useEffect(() => {
    let cancelled = false;
    const at = new Date();
    const target = day === "today" ? at : yesterday(at);
    fetchActivity(dayKey(target))
      .then((activity) => {
        if (cancelled) return;
        setFailed(false);
        setData({ activity, fetchedAt: at.getTime() });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [day, refreshKey, tick]);

  useEffect(() => {
    let cancelled = false;
    fetchHeatmap(4)
      .then((r) => {
        if (!cancelled) setHeatmap(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const isToday = day === "today";
  // Un cambio de día deja un instante los datos del anterior: no se pintan.
  const shown =
    data &&
    data.activity.day === dayKey(isToday ? new Date() : yesterday(new Date()))
      ? data
      : null;
  const rows = useMemo(
    () => (shown ? stateRows(shown.activity.byState) : []),
    [shown],
  );
  const head = shown ? headline(shown.activity, rows, isToday) : null;
  const dayStart = useMemo(() => {
    const [y, m, d] = (shown?.activity.day ?? dayKey(new Date()))
      .split("-")
      .map(Number);
    return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
  }, [shown]);

  return (
    <section className={styles.view}>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>{t("activity.eyebrow")}</p>
          <h1 data-testid="activity-title">
            {head
              ? head.title
              : failed
                ? t("activity.loadFailed")
                : t("activity.loading")}
          </h1>
          {head && <p data-testid="activity-detail">{head.detail}</p>}
        </div>
        <fieldset className={styles.seg} aria-label={t("activity.day")}>
          <button
            type="button"
            aria-pressed={!isToday}
            onClick={() => setDay("yesterday")}
          >
            {t("activity.yesterday")}
          </button>
          <button
            type="button"
            aria-pressed={isToday}
            onClick={() => setDay("today")}
          >
            {t("activity.today")}
          </button>
        </fieldset>
      </header>

      {shown && (
        <>
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <h2>{t("activity.timelineTitle")}</h2>
              <div className={styles.legend}>
                {LEGEND.map(([group, color]) => (
                  <span key={group}>
                    <i
                      className={
                        group === "waiting" ? styles.hatchSwatch : undefined
                      }
                      style={
                        group === "waiting" ? undefined : { background: color }
                      }
                    />
                    {groupLabel(group)}
                  </span>
                ))}
              </div>
            </div>
            <DayTimeline
              data={shown.activity}
              dayStart={dayStart}
              now={isToday ? shown.fetchedAt : null}
            />
          </article>

          <div className={styles.grid}>
            <article className={`${styles.card} ${styles.span7}`}>
              <h2>
                {isToday
                  ? t("activity.sessionsToday")
                  : t("activity.sessionsYesterday")}
              </h2>
              <SessionsTable
                sessions={shown.activity.sessions}
                fetchedAt={isToday ? shown.fetchedAt : null}
              />
            </article>
            <article className={`${styles.card} ${styles.span5}`}>
              <h2>{t("activity.breakdownTitle")}</h2>
              <StateBreakdown rows={rows} />
            </article>
            <article className={`${styles.card} ${styles.span12}`}>
              <div className={styles.cardHead}>
                <h2>{t("activity.heatmapTitle")}</h2>
                <span className={styles.ramp}>
                  {t("activity.less")}
                  {[0, 1, 2, 3, 4].map((n) => (
                    <i key={n} data-level={n} className={styles.cell} />
                  ))}
                  {t("activity.more")}
                </span>
              </div>
              {heatmap ? (
                <HourHeatmap minutes={heatmap.minutes} />
              ) : (
                <p className={styles.empty}>{t("activity.loading")}</p>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  );
}
