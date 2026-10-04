import type { ActivityResponse } from "@amnis/shared";
import { useTranslation } from "react-i18next";
import type { TodayUsage } from "../../../api/usage.ts";
import { formatTokens, formatUsd } from "../../../lib/history.ts";
import styles from "./NowCards.module.css";

/**
 * Lo consumido hoy, siempre como equivalente de API: un `$14,80` suelto se
 * lee como un cargo y no lo es (DESIGN §2).
 */
export function TodayCard({
  usage,
  activity,
}: {
  usage: TodayUsage | null;
  activity: ActivityResponse | null;
}) {
  const { t } = useTranslation();
  const sessions = activity?.sessions.length ?? 0;
  return (
    <article className={styles.card} data-testid="card-today">
      <div className={styles.row}>
        <h2>{t("now.today.title")}</h2>
        <a className={styles.link} href="#historico">
          {t("common.views.historico")}
        </a>
      </div>
      <div className={styles.row}>
        <span className={styles.pct}>
          {usage ? formatUsd(usage.costUsd) : "—"}
        </span>
        <small className={styles.note}>{t("now.today.apiEquiv")}</small>
      </div>
      {usage && (
        <small className={styles.mono}>
          {t("now.today.sessions", {
            tokens: formatTokens(usage.tokens),
            count: sessions,
          })}
        </small>
      )}
      <small className={styles.note}>{t("now.today.note")}</small>
    </article>
  );
}
