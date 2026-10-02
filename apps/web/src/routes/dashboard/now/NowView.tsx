import type { StateResponse } from "@amnis/shared";
import { fetchMediaDevices, sendMediaCommand } from "../../../api/media.ts";
import { useQuotaHistory } from "../../../api/quotaHistory.ts";
import { useNow } from "../../../lib/countdown.ts";
import { fiveHourWindow, paceHeadline } from "../../../lib/fiveHour.ts";
import { MediaPlayer } from "../../../lib/MediaPlayer/MediaPlayer.tsx";
import { extraLimits } from "../../../lib/quotaLimits.ts";
import { QuotaRing } from "../QuotaRing.tsx";
import { FiveHourCard } from "./FiveHourCard.tsx";
import styles from "./NowView.module.css";
import { PetHero } from "./PetHero.tsx";

const EYEBROW = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Primera mitad de la portada (#91): Amnis y la ventana de 5 h. La segunda
 * mitad (#92) sustituirá el resto, que aquí es el interino de #81.
 */
export function NowView({ state }: { state: StateResponse | null }) {
  const now = useNow();
  const quota = state?.quotas[0] ?? null;
  const window = quota ? fiveHourWindow(quota, now) : null;
  const samples = useQuotaHistory(
    window?.start ?? new Date(now.getTime() - 5 * 60 * 60_000),
    quota?.sampledAt ?? "",
  );
  const headline =
    quota && window
      ? paceHeadline(window, quota.projection.fiveHourAtReset)
      : null;

  return (
    <section className={styles.view}>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>{EYEBROW.format(now)}</p>
        <h1>{headline?.title ?? "Conectando con el daemon…"}</h1>
        {headline && <p>{headline.detail}</p>}
      </header>

      {state && (
        <div className={styles.grid}>
          <div className={styles.hero}>
            <PetHero state={state} now={now} />
          </div>
          {quota && (
            <div className={styles.window}>
              <FiveHourCard quota={quota} samples={samples} now={now} />
            </div>
          )}
        </div>
      )}

      <div className={styles.overview}>
        {state?.quotas.map((q) => (
          <div key={q.provider} className={styles.quotas}>
            {q.error && <p className={styles.quotaError}>{q.error}</p>}
            <QuotaRing
              label="7d"
              authoritative={q.authoritative?.sevenDay ?? null}
              estimated={null}
              now={now}
            />
            {extraLimits(q.authoritative?.limits ?? []).map((limit) => (
              <QuotaRing
                key={`${limit.kind}:${limit.scope ?? ""}`}
                label={limit.label}
                authoritative={limit}
                estimated={null}
                now={now}
              />
            ))}
          </div>
        ))}
        <div className={styles.mediaCard}>
          <MediaPlayer
            layout="wide"
            media={state?.media ?? null}
            onCommand={sendMediaCommand}
            loadDevices={fetchMediaDevices}
          />
        </div>
      </div>
    </section>
  );
}
