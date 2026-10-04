import { useTranslation } from "react-i18next";
import { RANGES, type Range } from "../../../lib/history.ts";
import styles from "./HistoryView.module.css";

export function RangeFilter({
  value,
  onChange,
}: {
  value: Range;
  onChange: (range: Range) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className={styles.seg} aria-label={t("history.range.label")}>
      {RANGES.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          {id === "all"
            ? t("history.range.all")
            : t("history.range.days", { days: id })}
        </button>
      ))}
    </fieldset>
  );
}
