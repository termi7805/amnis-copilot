import type { QuotaLimit } from "@amnis/shared";
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
  const scope = limit.scope ?? limit.label;
  const name = scopeTitle(scope);
  return (
    <article className={styles.card} data-testid="card-model-limit">
      <div className={styles.row}>
        <h2>Semana · {name}</h2>
        <span className={styles.pill}>real</span>
      </div>
      <LimitMeter
        utilization={limit.utilization}
        resetsAt={limit.resetsAt}
        now={now}
        color="var(--s1)"
      />
      <small className={styles.note}>
        Límite propio de {name} en tu plan, dentro del 7 d.
      </small>
    </article>
  );
}
