import type { QuotaHistoryResponse, QuotaSnapshot } from "@amnis/shared";
import { Trans, useTranslation } from "react-i18next";
import { dateFormat, formatNumber } from "../../../i18n/index.ts";
import { formatElapsed, formatUntil } from "../../../lib/countdown.ts";
import {
  CEILING_WINDOWS_NEEDED,
  type FiveHourWindow,
  fiveHourExhaustion,
  fiveHourWindow,
  SPARK_H,
  SPARK_W,
  severityPill,
  sparkPoints,
  sparkY,
} from "../../../lib/fiveHour.ts";
import styles from "./FiveHourCard.module.css";

const hhmm = (date: Date) =>
  dateFormat({ hour: "2-digit", minute: "2-digit" }).format(date);

/** Línea y área de la serie; la proyección sigue discontinua hasta el reset. */
function Sparkline({
  samples,
  window,
  projection,
}: {
  samples: QuotaHistoryResponse["samples"];
  window: FiveHourWindow;
  projection: number | null;
}) {
  const { t } = useTranslation();
  const points = sparkPoints(samples, window);
  const last = points.at(-1);
  const baseline = SPARK_H - 4;
  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={t("now.fiveHour.sparkLabel", { time: hhmm(window.start) })}
      data-testid="sparkline"
    >
      <line
        x1={0}
        x2={SPARK_W}
        y1={baseline}
        y2={baseline}
        stroke="var(--line)"
        vectorEffect="non-scaling-stroke"
      />
      {last && projection !== null && (
        <line
          data-testid="spark-projection"
          x1={last[0]}
          y1={last[1]}
          x2={SPARK_W}
          y2={sparkY(projection)}
          stroke="var(--ink-3)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {last && points.length > 1 && (
        <>
          <path
            d={`M0 ${baseline} ${points.map(([x, y]) => `L${x} ${y}`).join(" ")} L${last[0]} ${baseline} Z`}
            fill="var(--accent-soft)"
          />
          <path
            d={`M${points.map(([x, y]) => `${x} ${y}`).join(" L")}`}
            fill="none"
            stroke="var(--accent-mark)"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}

/**
 * La ventana de 5 h: uso real, estimación local y tiempo transcurrido en la
 * misma barra (34 % con el 55 % del tiempo es otra situación que con el 10 %).
 * Lo estimado se marca siempre como estimado: sin endpoint el número lleva
 * `~` y la divergencia y la proyección se ocultan, porque dependen del dato
 * real (DESIGN §4).
 */
export function FiveHourCard({
  quota,
  samples,
  now,
}: {
  quota: QuotaSnapshot;
  samples: QuotaHistoryResponse["samples"];
  now: Date;
}) {
  const { t } = useTranslation();
  const window = fiveHourWindow(quota, now);
  const pill = severityPill(quota, window);
  const countdown = formatUntil(window.end.toISOString(), now);
  const localPct = quota.local.fiveHourUtilization;
  // Sin calibrar, el `%` local sale de un techo inicial que no casa con los
  // tokens contados (#103): se enseñan los tokens, no el porcentaje.
  const calibrated = quota.local.calibrated;
  const projection = quota.projection.fiveHourAtReset;
  const divergence = quota.divergence;
  const exhaustion = fiveHourExhaustion(quota, window);

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <h2>{t("now.fiveHour.title")}</h2>
        <span className={styles.eyebrow}>{t("now.fiveHour.account")}</span>
      </div>

      <div className={styles.top}>
        <div>
          <div className={styles.bignum} data-testid="five-hour-value">
            {window.known ? (
              <>
                {window.estimated && "~"}
                {Math.round(window.used)}
                <sup>%</sup>
              </>
            ) : (
              "—"
            )}
          </div>
          <p className={styles.source}>
            {window.estimated
              ? `${t("now.fiveHour.sourceLocal")}${window.provisional ? t("now.fiveHour.sourceProvisional", { windows: window.provisional.windows, needed: CEILING_WINDOWS_NEEDED }) : ""}${quota.error ? ` · ${quota.error}` : ""}`
              : `${t("now.fiveHour.sourceEndpoint", { elapsed: formatElapsed(quota.sampledAt, now) })}${quota.rateLimitedAt ? t("now.fiveHour.rateLimited") : ""}`}
          </p>
        </div>
        <div className={styles.side}>
          <span className={styles.pill} data-tone={pill.tone}>
            {pill.label}
          </span>
          <p className={styles.reset}>
            <Trans
              i18nKey="now.fiveHour.resetsAt"
              values={{ time: hhmm(window.end) }}
              components={{ b: <b /> }}
            />
          </p>
          <p className={styles.reset}>
            <Trans
              i18nKey="now.fiveHour.left"
              values={{ countdown: countdown ?? "" }}
              components={{ b: <b /> }}
            />
          </p>
        </div>
      </div>

      <div>
        <div
          className={styles.track}
          title={[
            window.known &&
              t(
                window.estimated
                  ? "now.fiveHour.trackUsedEstimated"
                  : "now.fiveHour.trackUsedReal",
                { pct: Math.round(window.used) },
              ),
            !window.estimated &&
              calibrated &&
              t("now.fiveHour.trackLocal", { pct: Math.round(localPct) }),
            t("now.fiveHour.trackElapsed", {
              pct: Math.round(window.elapsedPct),
            }),
          ]
            .filter(Boolean)
            .join(", ")}
        >
          {window.known && (
            <div
              className={styles.fill}
              style={{ width: `${Math.min(100, window.used)}%` }}
            />
          )}
          {!window.estimated && calibrated && (
            <div
              className={styles.est}
              data-testid="mark-estimate"
              style={{ left: `${Math.min(100, localPct)}%` }}
            />
          )}
          <div
            className={styles.now}
            data-testid="mark-now"
            style={{ left: `${window.elapsedPct}%` }}
          />
        </div>
        <div className={styles.legend}>
          <span>
            {t("now.fiveHour.legendStart", { time: hhmm(window.start) })}
          </span>
          <span>{t("now.fiveHour.legendMarks")}</span>
          <span>{hhmm(window.end)}</span>
        </div>
      </div>

      {/* Con techo provisional no hay serie fiable: las muestras sin endpoint se
          guardaron con el techo del plan (#117). */}
      {window.known && !window.provisional && (
        <Sparkline
          samples={samples}
          window={window}
          projection={window.estimated ? null : projection}
        />
      )}

      <div className={styles.facts}>
        <div className={styles.fact}>
          <div className={styles.k}>{t("now.fiveHour.localTitle")}</div>
          <div className={styles.v} data-testid="fact-local">
            {calibrated
              ? `~${Math.round(localPct)} %`
              : quota.local.provisionalUtilization !== null
                ? `~${Math.round(quota.local.provisionalUtilization)} %`
                : "—"}
          </div>
          <div className={styles.d}>
            {t("now.fiveHour.localTokens", {
              tokens: formatNumber(quota.local.fiveHourTokens),
            })}
          </div>
          {!calibrated && (
            <div className={styles.d} data-testid="uncalibrated">
              {quota.local.provisionalUtilization !== null
                ? t("now.fiveHour.provisional", {
                    windows: quota.local.ceilingWindows,
                    needed: CEILING_WINDOWS_NEEDED,
                  })
                : t("now.fiveHour.uncalibrated")}
            </div>
          )}
        </div>
        {!window.estimated && (
          <>
            <div className={styles.fact} data-testid="fact-divergence">
              <div className={styles.k}>{t("now.fiveHour.outsideTitle")}</div>
              <div className={styles.v}>
                {divergence === null || !calibrated
                  ? "—"
                  : t("now.fiveHour.points", {
                      sign: divergence > 0 ? "+" : "",
                      points: Math.round(divergence),
                    })}
              </div>
              <div className={styles.d}>
                {calibrated
                  ? t("now.fiveHour.outsideDetail")
                  : t("now.fiveHour.outsidePending")}
              </div>
            </div>
            <div className={styles.fact} data-testid="fact-projection">
              <div className={styles.k}>
                {t("now.fiveHour.projectionTitle")}
              </div>
              <div className={styles.v}>
                {projection === null ? "—" : `${Math.round(projection)} %`}
              </div>
              <div className={styles.d}>
                {projection === null
                  ? t("now.fiveHour.fewSamples")
                  : t("now.fiveHour.lastHourPace")}
              </div>
            </div>
            <div className={styles.fact} data-testid="fact-exhausts">
              <div className={styles.k}>{t("now.fiveHour.exhaustsTitle")}</div>
              <div className={styles.v}>
                {exhaustion.kind === "at"
                  ? hhmm(exhaustion.at)
                  : exhaustion.kind === "lasts"
                    ? t("now.fiveHour.lasts")
                    : exhaustion.kind === "exhausted"
                      ? t("now.fiveHour.exhausted")
                      : "—"}
              </div>
              <div className={styles.d}>
                {exhaustion.kind === "at"
                  ? t("now.fiveHour.inTime", {
                      countdown:
                        formatUntil(exhaustion.at.toISOString(), now) ?? "",
                    })
                  : exhaustion.kind === "lasts"
                    ? t("now.fiveHour.lastHourPace")
                    : exhaustion.kind === "unknown"
                      ? t("now.fiveHour.fewSamples")
                      : ""}
              </div>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
