import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import {
  type CostDay,
  type CostSeries,
  formatUsd,
} from "../../../lib/history.ts";
import styles from "./HistoryView.module.css";

const SERIES_CLASS = [
  styles.series1,
  styles.series2,
  styles.series3,
  styles.series4,
];
const SERIES_VAR = ["--s1", "--s2", "--s3", "--s4"];

function CostTooltip({
  payload,
  models,
}: TooltipContentProps & { models: string[] }) {
  const day = payload?.[0]?.payload as CostDay | undefined;
  if (!day) return null;
  return (
    <div className={styles.tooltip}>
      <strong>{day.day}</strong> · {formatUsd(day.total)}
      {day.total === 0 && <div>Sin actividad</div>}
      {models.map((m, i) =>
        day.byModel[m] ? (
          <div key={m} className={styles.tipRow}>
            <span>
              <i style={{ background: `var(${SERIES_VAR[i]})` }} />
              {m}
            </span>
            <span>{formatUsd(day.byModel[m])}</span>
          </div>
        ) : null,
      )}
    </div>
  );
}

/** Coste y no tokens: la lectura de caché es el 90 % de los tokens y una
 * barra por tipo sería una sola franja gris. */
export function CostByModelChart({ series }: { series: CostSeries }) {
  const data = series.days.map((d) => ({ ...d, ...d.byModel }));
  return (
    <>
      <div className={styles.legend}>
        {series.models.map((m, i) => (
          <span key={m}>
            <i style={{ background: `var(${SERIES_VAR[i]})` }} />
            {m}
          </span>
        ))}
      </div>
      <div className={styles.chart} data-testid="cost-chart">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tickFormatter={(v: number) => `$${v}`} width={48} />
            <Tooltip
              content={(props) => (
                <CostTooltip {...props} models={series.models} />
              )}
            />
            {series.models.map((m, i) => (
              <Bar
                key={m}
                dataKey={m}
                name={m}
                stackId="cost"
                className={SERIES_CLASS[i]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
