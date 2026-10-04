import type { QuotaPeak, StateResponse } from "@amnis/shared";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchQuotaPeaks } from "../../../api/quotaHistory.ts";
import { fetchUsage, type UsageResponse } from "../../../api/usage.ts";
import {
  activity,
  costSeries,
  formatTokens,
  formatUsd,
  headline,
  limitDays,
  modelTotals,
  type Range,
  rangeDays,
  rangeFrom,
  tokenTypeTotals,
  totalCost,
} from "../../../lib/history.ts";
import { CostByModelChart } from "./CostByModelChart.tsx";
import { DailyPeakChart } from "./DailyPeakChart.tsx";
import styles from "./HistoryView.module.css";
import { RangeFilter } from "./RangeFilter.tsx";
import { ModelsTable, ProjectsTable, TokenTypeTable } from "./Tables.tsx";

interface HistoryData {
  byDayModel: UsageResponse;
  byProject: UsageResponse;
  peaks: QuotaPeak[];
}

/**
 * Histórico (#93). Las tres peticiones comparten el mismo `from`, calculado
 * una vez por cambio de rango: así la cifra clave, las barras y la tabla de
 * proyectos suman sobre exactamente el mismo conjunto de eventos.
 */
export function HistoryView({ state }: { state: StateResponse | null }) {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>(30);
  const [data, setData] = useState<HistoryData | null>(null);
  const [failed, setFailed] = useState(false);
  // Se fija al cambiar de rango; `now` no se mueve entre renders.
  const { from, now } = useMemo(() => {
    const at = new Date();
    return { from: rangeFrom(range, at), now: at };
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    Promise.all([
      fetchUsage({ groupBy: "day,model", from }),
      fetchUsage({ groupBy: "project", from }),
      fetchQuotaPeaks(from ?? new Date(0), now).catch(() => [] as QuotaPeak[]),
    ])
      .then(([byDayModel, byProject, peaks]) => {
        if (!cancelled) setData({ byDayModel, byProject, peaks });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [from, now]);

  const plan = state?.plan ?? null;
  const rows = data?.byDayModel.rows ?? [];
  const total = totalCost(rows);
  const firstDay = rows.map((r) => r.key).sort()[0];
  const days = rangeDays(range, firstDay, now);
  const head = headline(total, plan, range, days);
  const tokens = tokenTypeTotals(rows);
  const act = activity(rows, now);
  const series = costSeries(rows, from, now);
  const limits = limitDays(data?.peaks ?? []);

  return (
    <section className={styles.view}>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>{t("history.eyebrow")}</p>
          <h1 data-testid="history-title">
            {data
              ? head.title
              : failed
                ? t("history.loadFailed")
                : t("history.loading")}
          </h1>
          {data && <p data-testid="history-detail">{head.detail}</p>}
        </div>
        <RangeFilter value={range} onChange={setRange} />
      </header>

      {data && (
        <>
          <div className={styles.kpis}>
            <div className={styles.card}>
              <div className={styles.k}>{t("history.kpi.cost")}</div>
              <div className={styles.v} data-testid="kpi-cost">
                {formatUsd(total)}
              </div>
              <div className={styles.d}>
                {plan
                  ? t("history.kpi.planMonthly", {
                      plan: plan.label,
                      price: formatUsd(plan.monthlyUsd),
                    })
                  : t("history.kpi.noPlan")}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.k}>{t("history.kpi.tokens")}</div>
              <div className={styles.v}>{formatTokens(tokens.total)}</div>
              <div className={styles.d}>
                {tokens.total > 0
                  ? t("history.kpi.cacheShare", {
                      pct: Math.round((tokens.cacheRead / tokens.total) * 100),
                    })
                  : t("history.kpi.noTokens")}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.k}>{t("history.kpi.limitDays")}</div>
              <div className={styles.v}>{limits.count}</div>
              <div className={styles.d}>
                {limits.last
                  ? t("history.kpi.lastLimit", { day: limits.last })
                  : t("history.kpi.noLimit")}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.k}>{t("history.kpi.activeDays")}</div>
              <div className={styles.v}>
                {act.active} / {days}
              </div>
              <div className={styles.d}>
                {t("history.kpi.streak", { days: act.streak })}
              </div>
            </div>
          </div>

          <article className={styles.card}>
            <h2>{t("history.costTitle")}</h2>
            <CostByModelChart series={series} />
          </article>

          <div className={styles.grid}>
            <article className={`${styles.card} ${styles.span7}`}>
              <h2>{t("history.projects")}</h2>
              <div className={styles.tableWrap}>
                <ProjectsTable rows={data.byProject.rows} />
              </div>
            </article>
            <article className={`${styles.card} ${styles.span5}`}>
              <h2>{t("history.models")}</h2>
              <div className={styles.tableWrap}>
                <ModelsTable rows={modelTotals(rows)} series={series.models} />
              </div>
              <h2 className={styles.sub}>{t("history.tokenType")}</h2>
              <div className={styles.tableWrap}>
                <TokenTypeTable totals={tokens} />
              </div>
            </article>
            <article className={`${styles.card} ${styles.span12}`}>
              <h2>{t("history.peakTitle")}</h2>
              <p className={styles.eyebrow}>{t("history.peakEyebrow")}</p>
              <DailyPeakChart peaks={data.peaks} />
            </article>
          </div>

          <p className={styles.foot}>
            <span>
              {t("history.pricesUpdated", {
                date: data.byDayModel.pricesUpdatedAt,
              })}
            </span>
            <span>{t("history.onlyClaudeCode")}</span>
            {data.byDayModel.unpricedModels.length > 0 && (
              <span>
                {t("history.unpriced", {
                  models: data.byDayModel.unpricedModels.join(", "),
                })}
              </span>
            )}
          </p>
        </>
      )}
    </section>
  );
}
