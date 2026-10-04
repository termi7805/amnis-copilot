import { useTranslation } from "react-i18next";
import { dateFormat } from "../../../i18n/index.ts";
import { formatMinutes, heatLevel } from "../../../lib/activity.ts";
import styles from "./ActivityView.module.css";

/** Lunes primero, como las filas del daemon; el 1-1-2024 fue lunes. */
const weekdays = () =>
  Array.from({ length: 7 }, (_, d) =>
    dateFormat({ weekday: "short" }).format(new Date(2024, 0, 1 + d)),
  );

/** Rampa secuencial de un solo tono (`--heat-0…4`): más oscuro, más minutos. */
export function HourHeatmap({ minutes }: { minutes: number[][] }) {
  useTranslation();
  const max = Math.max(0, ...minutes.flat());
  return (
    <div className={styles.tableWrap}>
      <div className={styles.heat} data-testid="heatmap">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: las 24 horas son fijas
          <span key={h} className={styles.hl}>
            {h % 3 === 0 ? h : ""}
          </span>
        ))}
        {weekdays().map((day, d) => (
          <HeatRow key={day} day={day} row={minutes[d] ?? []} max={max} />
        ))}
      </div>
    </div>
  );
}

function HeatRow({
  day,
  row,
  max,
}: {
  day: string;
  row: number[];
  max: number;
}) {
  return (
    <>
      <span className={styles.lbl}>{day}</span>
      {Array.from({ length: 24 }, (_, h) => {
        const value = row[h] ?? 0;
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: las 24 horas son fijas
            key={h}
            className={styles.cell}
            data-level={heatLevel(value, max)}
            title={`${day} ${String(h).padStart(2, "0")}:00 · ${formatMinutes(value)}`}
          />
        );
      })}
    </>
  );
}
