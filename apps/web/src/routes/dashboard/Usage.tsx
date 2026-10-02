import { useEffect, useState } from "react";
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
  fetchUsage,
  type UsageAggregateRow,
  type UsageGroupBy,
  type UsageResponse,
} from "../../api/usage.ts";
import styles from "./Usage.module.css";

type RangeDays = 7 | 30 | undefined;

const GROUP_LABELS: Record<UsageGroupBy, string> = {
  day: "Día",
  project: "Proyecto",
  model: "Modelo",
};

function keyLabel(groupBy: UsageGroupBy, key: string): string {
  if (key !== "") return key;
  return groupBy === "project" ? "(sin proyecto)" : "(sin modelo)";
}

/** Equivalente de API, nunca "gastado" — domain/cost.ts. Se repite en
 * cada celda: es literalmente el criterio de aceptación de la issue. */
function formatCost(costUsd: number): string {
  return `$${costUsd.toFixed(2)} equiv. API`;
}

function rangeStart(rangeDays: RangeDays): Date | undefined {
  if (!rangeDays) return undefined;
  return new Date(Date.now() - rangeDays * 24 * 60 * 60_000);
}

/**
 * `GET /api/usage` histórico (docs/DESIGN.md §2): dice cuánto y en qué
 * proyecto, nunca qué se pidió — los usage_events no guardan prompts.
 * `groupBy=day` es la única serie temporal, y es donde entra Recharts
 * (docs/STACK.md §2: la única issue que lo justifica); project/model
 * son totales, y una tabla responde sin gráfico.
 */
export function Usage() {
  const [groupBy, setGroupBy] = useState<UsageGroupBy>("day");
  const [rangeDays, setRangeDays] = useState<RangeDays>(7);
  const [data, setData] = useState<UsageResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUsage({ groupBy, from: rangeStart(rangeDays) }).then((response) => {
      if (!cancelled) setData(response);
    });
    return () => {
      cancelled = true;
    };
  }, [groupBy, rangeDays]);

  return (
    <section className={styles.usage}>
      <div className={styles.controls}>
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as UsageGroupBy)}
        >
          {(Object.keys(GROUP_LABELS) as UsageGroupBy[]).map((value) => (
            <option key={value} value={value}>
              {GROUP_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          value={rangeDays ?? "all"}
          onChange={(e) =>
            setRangeDays(
              e.target.value === "all"
                ? undefined
                : (Number(e.target.value) as RangeDays),
            )
          }
        >
          <option value="7">7 días</option>
          <option value="30">30 días</option>
          <option value="all">Todo</option>
        </select>
      </div>

      {data &&
        (groupBy === "day" ? (
          <UsageChart rows={data.rows} />
        ) : (
          <UsageTable groupBy={groupBy} rows={data.rows} />
        ))}

      {data && (
        <p className={styles.pricesUpdatedAt}>
          Precios actualizados: {data.pricesUpdatedAt}
        </p>
      )}
      {data && data.unpricedModels.length > 0 && (
        <p className={styles.pricesUpdatedAt}>
          Sin precio (cuentan 0 $): {data.unpricedModels.join(", ")}
        </p>
      )}
    </section>
  );
}

function UsageTooltip({ label, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload as UsageAggregateRow | undefined;
  if (!row) return null;

  return (
    <div className={styles.tooltip}>
      <strong>{label}</strong>
      <div>{formatCost(row.costUsd)}</div>
    </div>
  );
}

function UsageChart({ rows }: { rows: UsageAggregateRow[] }) {
  return (
    <div className={styles.chart}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="key" />
          <YAxis />
          <Tooltip content={UsageTooltip} />
          <Bar
            dataKey="inputTokens"
            stackId="tokens"
            name="input"
            fill="#3a7d44"
          />
          <Bar
            dataKey="outputTokens"
            stackId="tokens"
            name="output"
            fill="#7fd88f"
          />
          <Bar
            dataKey="cacheCreationTokens"
            stackId="tokens"
            name="cache write"
            fill="#d8b56a"
          />
          <Bar
            dataKey="cacheReadTokens"
            stackId="tokens"
            name="cache read"
            fill="#c9c9c9"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function UsageTable({
  groupBy,
  rows,
}: {
  groupBy: UsageGroupBy;
  rows: UsageAggregateRow[];
}) {
  const sorted = [...rows].sort((a, b) => b.costUsd - a.costUsd);

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>{GROUP_LABELS[groupBy]}</th>
          <th>Tokens</th>
          <th>Coste</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => {
          const totalTokens =
            row.inputTokens +
            row.outputTokens +
            row.cacheCreationTokens +
            row.cacheReadTokens;
          return (
            <tr key={row.key}>
              <td>{keyLabel(groupBy, row.key)}</td>
              <td>{totalTokens.toLocaleString()}</td>
              <td data-testid="usage-cost">{formatCost(row.costUsd)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
