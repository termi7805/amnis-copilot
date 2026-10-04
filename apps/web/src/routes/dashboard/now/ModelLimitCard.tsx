import type { QuotaLimit } from "@amnis/shared";
import { useTranslation } from "react-i18next";
import { scopeTitle } from "../../../lib/nowCards.ts";
import { LimitMeter } from "./LimitMeter.tsx";
import styles from "./NowCards.module.css";

/**
 * Una por cada límite semanal con alcance de modelo que tenga la cuenta
 * (`limits[]`). No se cablea ningún modelo: el nombre sale del `scope`.
 */
export function ModelLimitCard({
  limit,
  now,
}: {
  limit: QuotaLimit;
  now: Date;
}) {
  const { t } = useTranslation();
  const scope = limit.scope ?? limit.label;
  const name = scopeTitle(scope);
  return (
    <article className={styles.card} data-testid="card-model-limit">
      <div className={styles.row}>
        <h2>{t("now.limit.modelTitle", { name })}</h2>
        <span className={styles.pill}>{t("now.limit.real")}</span>
      </div>
      <LimitMeter
        utilization={limit.utilization}
        resetsAt={limit.resetsAt}
        now={now}
        color="var(--s1)"
      />
      <small className={styles.note}>
        {t("now.limit.modelNote", { name })}
      </small>
    </article>
  );
}
