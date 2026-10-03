import { RANGES, type Range } from "../../../lib/history.ts";
import styles from "./HistoryView.module.css";

export function RangeFilter({
  value,
  onChange,
}: {
  value: Range;
  onChange: (range: Range) => void;
}) {
  return (
    <fieldset className={styles.seg} aria-label="Rango">
      {RANGES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}
