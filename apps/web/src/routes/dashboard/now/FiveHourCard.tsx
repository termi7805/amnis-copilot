import type { QuotaHistoryResponse, QuotaSnapshot } from "@amnis/shared";
import { formatElapsed, formatUntil } from "../../../lib/countdown.ts";
import {
  CEILING_WINDOWS_NEEDED,
  type FiveHourWindow,
  fiveHourWindow,
  SPARK_H,
  SPARK_W,
  severityPill,
  sparkPoints,
  sparkY,
} from "../../../lib/fiveHour.ts";
import styles from "./FiveHourCard.module.css";

const HHMM = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
});

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
  const points = sparkPoints(samples, window);
  const last = points.at(-1);
  const baseline = SPARK_H - 4;
  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Uso de la ventana desde las ${HHMM.format(window.start)}`}
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
  const window = fiveHourWindow(quota, now);
  const pill = severityPill(quota);
  const countdown = formatUntil(window.end.toISOString(), now);
  const localPct = quota.local.fiveHourUtilization;
  // Sin calibrar, el `%` local sale de un techo inicial que no casa con los
  // tokens contados (#103): se enseñan los tokens, no el porcentaje.
  const calibrated = quota.local.calibrated;
  const projection = quota.projection.fiveHourAtReset;
  const divergence = quota.divergence;

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <h2>Ventana de 5 horas</h2>
        <span className={styles.eyebrow}>Claude · cuenta activa</span>
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
              ? `estimación local${window.provisional ? ` · provisional, ${window.provisional.windows}/${CEILING_WINDOWS_NEEDED} ventanas` : ""}${quota.error ? ` · ${quota.error}` : ""}`
              : `del endpoint de Anthropic · hace ${formatElapsed(quota.sampledAt, now)}${quota.rateLimitedAt ? " · la última consulta dio 429" : ""}`}
          </p>
        </div>
        <div className={styles.side}>
          <span className={styles.pill} data-tone={pill.tone}>
            {pill.label}
          </span>
          <p className={styles.reset}>
            Se reinicia a las <b>{HHMM.format(window.end)}</b>
          </p>
          <p className={styles.reset}>
            quedan <b>{countdown}</b>
          </p>
        </div>
      </div>

      <div>
        <div
          className={styles.track}
          title={[
            window.known &&
              `Uso ${window.estimated ? "estimado" : "real"} ${Math.round(window.used)} %`,
            !window.estimated &&
              calibrated &&
              `estimación local ${Math.round(localPct)} %`,
            `tiempo transcurrido ${Math.round(window.elapsedPct)} %`,
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
          <span>{HHMM.format(window.start)} inicio</span>
          <span>│ estimación local · ┆ ahora</span>
          <span>{HHMM.format(window.end)}</span>
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
          <div className={styles.k}>Estimación local</div>
          <div className={styles.v} data-testid="fact-local">
            {calibrated
              ? `~${Math.round(localPct)} %`
              : quota.local.provisionalUtilization !== null
                ? `~${Math.round(quota.local.provisionalUtilization)} %`
                : "—"}
          </div>
          <div className={styles.d}>
            {quota.local.fiveHourTokens.toLocaleString("es-ES")} tokens de
            Claude Code
          </div>
          {!calibrated && (
            <div className={styles.d} data-testid="uncalibrated">
              {quota.local.provisionalUtilization !== null
                ? `provisional: ${quota.local.ceilingWindows}/${CEILING_WINDOWS_NEEDED} ventanas cerradas para fijar el techo`
                : "sin calibrar: faltan ventanas cerradas para fijar el techo"}
            </div>
          )}
        </div>
        {!window.estimated && (
          <>
            <div className={styles.fact} data-testid="fact-divergence">
              <div className={styles.k}>Fuera de Claude Code</div>
              <div className={styles.v}>
                {divergence === null || !calibrated
                  ? "—"
                  : `${divergence > 0 ? "+" : ""}${Math.round(divergence)} pts`}
              </div>
              <div className={styles.d}>
                {calibrated
                  ? "claude.ai, móvil u otro equipo"
                  : "aparece cuando la estimación local esté calibrada"}
              </div>
            </div>
            <div className={styles.fact} data-testid="fact-projection">
              <div className={styles.k}>Proyección al reset</div>
              <div className={styles.v}>
                {projection === null ? "—" : `${Math.round(projection)} %`}
              </div>
              <div className={styles.d}>
                {projection === null
                  ? "pocas muestras aún"
                  : "al ritmo de la última hora"}
              </div>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
