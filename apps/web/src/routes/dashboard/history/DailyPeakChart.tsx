import type { QuotaPeak } from "@amnis/shared";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./HistoryView.module.css";

function peakColor(peak: number): string {
  if (peak >= 100) return "var(--crit)";
  if (peak >= 80) return "var(--warn-mark)";
  return "var(--accent-mark)";
}

function PeakTooltip({ payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as QuotaPeak | undefined;
  if (!p) return null;
  return (
    <div className={styles.tooltip}>
      <strong>{p.day}</strong>
      <div>Pico 5 h: {Math.round(p.peak)} %</div>
      {p.peak >= 100 && <div>Llegaste al límite</div>}
    </div>
  );
}

export function DailyPeakChart({ peaks }: { peaks: QuotaPeak[] }) {
  if (peaks.length === 0) {
    return <p className={styles.empty}>Sin muestras de cuota en este rango.</p>;
  }
  return (
    <div className={styles.chart} data-testid="peak-chart">
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={peaks}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            tickFormatter={(v: number) => `${v} %`}
            width={48}
          />
          <Tooltip content={PeakTooltip} />
          <ReferenceLine y={100} stroke="var(--crit)" strokeDasharray="4 4" />
          <Bar dataKey="peak">
            {peaks.map((p) => (
              <Cell key={p.day} fill={peakColor(p.peak)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
