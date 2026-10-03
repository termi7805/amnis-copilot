import type { QuotaPeak, StateResponse } from "@amnis/shared";
import { useEffect, useMemo, useState } from "react";
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
  const limits = limitDays(data?.peaks ?? []);

  return (
    <section className={styles.view}>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            Equivalente de API, nunca dinero gastado
          </p>
          <h1 data-testid="history-title">
            {data
              ? head.title
              : failed
                ? "No se pudo leer el histórico"
                : "Cargando…"}
          </h1>
          {data && <p data-testid="history-detail">{head.detail}</p>}
        </div>
        <RangeFilter value={range} onChange={setRange} />
      </header>

      {data && (
        <>
          <div className={styles.kpis}>
            <div className={styles.card}>
              <div className={styles.k}>Equivalente de API</div>
              <div className={styles.v} data-testid="kpi-cost">
                {formatUsd(total)}
              </div>
              <div className={styles.d}>
                {plan
                  ? `Plan ${plan.label}: ${formatUsd(plan.monthlyUsd)} al mes`
                  : "Sin plan detectado"}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.k}>Tokens</div>
              <div className={styles.v}>{formatTokens(tokens.total)}</div>
              <div className={styles.d}>
                {tokens.total > 0
                  ? `${Math.round((tokens.cacheRead / tokens.total) * 100)} % lectura de caché`
                  : "Sin tokens"}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.k}>Días al límite de 5 h</div>
              <div className={styles.v}>{limits.count}</div>
              <div className={styles.d}>
                {limits.last
                  ? `el último, ${limits.last}`
                  : "ninguno en el rango"}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.k}>Días activos</div>
              <div className={styles.v}>
                {act.active} / {days}
              </div>
              <div className={styles.d}>racha actual: {act.streak} días</div>
            </div>
          </div>

          <article className={styles.card}>
            <h2>Coste equivalente por día y modelo</h2>
            <CostByModelChart series={costSeries(rows, from, now)} />
          </article>

          <div className={styles.grid}>
            <article className={`${styles.card} ${styles.span7}`}>
              <h2>Proyectos</h2>
              <div className={styles.tableWrap}>
                <ProjectsTable rows={data.byProject.rows} />
              </div>
            </article>
            <article className={`${styles.card} ${styles.span5}`}>
              <h2>Modelos</h2>
              <div className={styles.tableWrap}>
                <ModelsTable rows={modelTotals(rows)} />
              </div>
              <h2 className={styles.sub}>Tipo de token</h2>
              <div className={styles.tableWrap}>
                <TokenTypeTable totals={tokens} />
              </div>
            </article>
            <article className={`${styles.card} ${styles.span12}`}>
              <h2>Pico diario de la ventana de 5 h</h2>
              <p className={styles.eyebrow}>
                dato del endpoint · el 100 % es el límite
              </p>
              <DailyPeakChart peaks={data.peaks} />
            </article>
          </div>

          <p className={styles.foot}>
            <span>
              Precios de la API actualizados el{" "}
              {data.byDayModel.pricesUpdatedAt}.
            </span>
            <span>
              Solo cuenta lo que pasa por Claude Code: lo de claude.ai no deja
              transcripts.
            </span>
            {data.byDayModel.unpricedModels.length > 0 && (
              <span>
                Sin precio (cuentan 0 $):{" "}
                {data.byDayModel.unpricedModels.join(", ")}
              </span>
            )}
          </p>
        </>
      )}
    </section>
  );
}
