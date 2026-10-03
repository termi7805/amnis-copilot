import type { ActivityResponse, ActivitySegment } from "@amnis/shared";
import { useId, useState } from "react";
import {
  formatMinutes,
  GROUP_LABEL,
  timelineRange,
} from "../../../lib/activity.ts";
import { STATE_TITLE } from "../../../lib/Pet/Pet.tsx";
import styles from "./ActivityView.module.css";

const W = 960;
const LABEL_W = 150;
const PAD_R = 10;
const LANE_H = 30;
const TOP = 8;
const BOTTOM = 24;

const FILL_VAR = {
  working: "var(--act-work)",
  thinking: "var(--act-explore)",
  waiting: "var(--act-wait)",
  resting: "var(--act-idle)",
} as const;

export function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface Tip {
  segment: ActivitySegment;
  x: number;
  y: number;
}

/**
 * Línea del día (#94): un carril por sesión, un rect por tramo. Los doce
 * estados van agrupados en cuatro colores; el detalle va en el tooltip.
 * `waiting` lleva rayado además de color: es el tramo que hay que ver de un
 * vistazo, también con daltonismo o impreso.
 */
export function DayTimeline({
  data,
  dayStart,
  now,
}: {
  data: ActivityResponse;
  dayStart: Date;
  now: number | null;
}) {
  const hatchId = useId();
  const [tip, setTip] = useState<Tip | null>(null);
  const { from, to } = timelineRange(data.segments, dayStart);
  const H = TOP + data.sessions.length * LANE_H + BOTTOM;
  const x = (ms: number) =>
    LABEL_W + ((ms - from) / (to - from)) * (W - LABEL_W - PAD_R);

  const hours: number[] = [];
  const firstH = Math.round((from - dayStart.getTime()) / 3_600_000);
  const lastH = Math.round((to - dayStart.getTime()) / 3_600_000);
  for (let h = firstH + (firstH % 2); h <= lastH; h += 2) hours.push(h);

  const show = (segment: ActivitySegment, el: SVGRectElement) => {
    const host = el.ownerSVGElement?.parentElement?.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    if (!host) return;
    setTip({
      segment,
      x: box.left + box.width / 2 - host.left,
      y: box.top - host.top,
    });
  };

  if (data.sessions.length === 0) {
    return <p className={styles.empty}>Sin sesiones este día.</p>;
  }

  return (
    <div className={styles.timelineWrap}>
      <div className={styles.timeline}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Estados por sesión a lo largo del día"
          data-testid="day-timeline"
        >
          <defs>
            <pattern
              id={hatchId}
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="5" height="5" fill="var(--act-wait)" />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="5"
                stroke="rgb(0 0 0 / .35)"
                strokeWidth="2"
              />
            </pattern>
          </defs>
          {hours.map((h) => {
            const at = dayStart.getTime() + h * 3_600_000;
            return (
              <g key={h}>
                <line
                  className={styles.gridline}
                  x1={x(at)}
                  x2={x(at)}
                  y1={TOP}
                  y2={H - BOTTOM}
                />
                <text
                  className={styles.axis}
                  x={x(at)}
                  y={H - 7}
                  textAnchor="middle"
                >
                  {String(h % 24).padStart(2, "0")}:00
                </text>
              </g>
            );
          })}
          {data.sessions.map((session, i) => {
            const y = TOP + i * LANE_H;
            return (
              <g key={session.sessionId} data-testid="lane">
                <text className={styles.laneName} x={0} y={y + 13}>
                  {session.project ?? "sin proyecto"}
                </text>
                <text className={styles.axis} x={0} y={y + 25}>
                  {session.gitBranch ?? ""}
                </text>
                {data.segments
                  .filter((s) => s.sessionId === session.sessionId)
                  .map((s) => {
                    const x0 = x(Date.parse(s.start));
                    const x1 = x(Date.parse(s.end));
                    const label = `${STATE_TITLE[s.state]} · ${hhmm(Date.parse(s.start))}–${hhmm(Date.parse(s.end))}`;
                    return (
                      // biome-ignore lint/a11y/noStaticElementInteractions: el tramo solo muestra un tooltip (hover/foco), no es un control; su aria-label dice lo mismo
                      <rect
                        key={s.start}
                        data-state={s.state}
                        data-group={s.group}
                        x={x0 + 1}
                        y={y + 5}
                        width={Math.max(2, x1 - x0 - 2)}
                        height={LANE_H - 12}
                        rx={3}
                        fill={
                          s.group === "waiting"
                            ? `url(#${hatchId})`
                            : FILL_VAR[s.group]
                        }
                        aria-label={label}
                        tabIndex={0}
                        onMouseMove={(e) => show(s, e.currentTarget)}
                        onMouseLeave={() => setTip(null)}
                        onFocus={(e) => show(s, e.currentTarget)}
                        onBlur={() => setTip(null)}
                      >
                        <title>{label}</title>
                      </rect>
                    );
                  })}
              </g>
            );
          })}
          {now !== null && now >= from && now <= to && (
            <g data-testid="now-mark">
              <line
                x1={x(now)}
                x2={x(now)}
                y1={TOP - 4}
                y2={H - BOTTOM}
                stroke="var(--ink)"
                strokeWidth="1.5"
              />
              <text
                className={styles.axis}
                x={x(now) + 5}
                y={TOP + 4}
                style={{ fill: "var(--ink)" }}
              >
                ahora
              </text>
            </g>
          )}
        </svg>
        {tip && (
          <div
            className={styles.tip}
            style={{ left: tip.x, top: tip.y }}
            role="status"
          >
            <b>{STATE_TITLE[tip.segment.state]}</b>
            <div>{GROUP_LABEL[tip.segment.group]}</div>
            <div className={styles.num}>
              {hhmm(Date.parse(tip.segment.start))}–
              {hhmm(Date.parse(tip.segment.end))} ·{" "}
              {formatMinutes(
                (Date.parse(tip.segment.end) - Date.parse(tip.segment.start)) /
                  60_000,
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
