import { Usage } from "../Usage.tsx";
import styles from "./HistoryView.module.css";

/** Interino: el histórico de E5 tal cual, hasta que #94 lo sustituya. */
export function HistoryView() {
  return (
    <div className={styles.scroll}>
      <Usage />
    </div>
  );
}
