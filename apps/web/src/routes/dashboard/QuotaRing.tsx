import type { QuotaWindow } from "@amnis/shared";
import { formatUntil } from "../../lib/countdown.ts";
import styles from "./QuotaRing.module.css";

export interface QuotaRingProps {
  label: string;
  /** `null` si el endpoint OAuth no respondió — nunca un 0%. */
  authoritative: QuotaWindow | null;
  /** Estimación local (0-100), o `null` si no hay ninguna (7d sin endpoint). */
  estimated: number | null;
  now: Date;
  /** Lado del `<svg>` en px. El `viewBox` sigue en 0-100, así que la
   * geometría escala sola (#42 lo usa más pequeño en la mascota). */
  size?: number;
}

/**
 * Un `<circle>` con `strokeDasharray`, sin librería (docs/STACK.md §2).
 * `pathLength={100}` para que el arco se exprese directamente en
 * unidades de porcentaje, sin depender del radio elegido. Puede superar
 * el 100%: `estimate()` en domain/localQuota.ts documenta que por
 * encima de 100 es señal real, así que el arco se satura en la
 * circunferencia completa pero la cifra sigue mostrando el valor real.
 *
 * El anillo estimado es un arco fino y apagado, no punteado: el
 * `strokeDasharray` ya está ocupado codificando el porcentaje (CSS no
 * puede añadir su propio patrón de guiones sin pisar ese cálculo, las
 * reglas de la hoja de estilos ganan a los atributos de presentación).
 */
export function QuotaRing({
  label,
  authoritative,
  estimated,
  now,
  size = 96,
}: QuotaRingProps) {
  const hasData = authoritative !== null || estimated !== null;
  const displayValue = authoritative?.utilization ?? estimated;
  const countdown = authoritative
    ? formatUntil(authoritative.resetsAt, now)
    : null;

  return (
    <div className={styles.ring}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img">
        <title>
          {label}: {hasData ? `${displayValue}%` : "sin dato"}
        </title>
        <circle
          className={styles.track}
          cx="50"
          cy="50"
          r="42"
          pathLength={100}
        />
        {estimated !== null && (
          <circle
            className={styles.estimated}
            cx="50"
            cy="50"
            r="36"
            pathLength={100}
            strokeDasharray={`${Math.min(100, estimated)} 100`}
          />
        )}
        {authoritative !== null && (
          <circle
            className={styles.authoritative}
            cx="50"
            cy="50"
            r="42"
            pathLength={100}
            strokeDasharray={`${Math.min(100, authoritative.utilization)} 100`}
          />
        )}
      </svg>
      <div className={styles.readout}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value} data-testid="quota-value">
          {hasData ? (
            <>
              {authoritative === null && "~"}
              {displayValue}%
            </>
          ) : (
            "sin dato"
          )}
        </span>
        <span className={styles.countdown} data-testid="quota-countdown">
          {authoritative
            ? (countdown ?? "sin dato del endpoint")
            : estimated !== null
              ? "estimado"
              : null}
        </span>
      </div>
    </div>
  );
}
