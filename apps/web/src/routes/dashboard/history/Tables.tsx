import type { UsageAggregateRow } from "../../../api/usage.ts";
import {
  formatTokens,
  formatUsd,
  type ModelTotal,
  modelFamily,
  modelLabel,
  projectLabel,
  rowTokens,
  type TokenTypeTotals,
} from "../../../lib/history.ts";
import styles from "./HistoryView.module.css";

const SERIES_VAR = ["--s1", "--s2", "--s3", "--s4"];

const pct = (part: number, whole: number) =>
  `${whole > 0 ? Math.round((part / whole) * 100) : 0} %`;

const TOP_PROJECTS = 10;

/** Los diez primeros por coste y el resto en una fila "Otros": `project` es
 * el `cwd`, así que hay una fila por subdirectorio y la cola es larga; con la
 * fila agregada la tabla sigue sumando el total del rango. */
export function ProjectsTable({ rows }: { rows: UsageAggregateRow[] }) {
  const sorted = [...rows].sort((a, b) => b.costUsd - a.costUsd);
  const total = rows.reduce((s, r) => s + r.costUsd, 0);
  const max = sorted[0]?.costUsd ?? 0;
  const top = sorted.slice(0, TOP_PROJECTS);
  const rest = sorted.slice(TOP_PROJECTS);
  const restCost = rest.reduce((s, r) => s + r.costUsd, 0);
  const restTokens = rest.reduce((s, r) => s + rowTokens(r), 0);
  const bar = (cost: number) => (
    <span className={styles.share}>
      <i style={{ width: `${max > 0 ? (cost / max) * 100 : 0}%` }} />
    </span>
  );
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Proyecto</th>
          <th className={styles.n}>Sesiones</th>
          <th className={styles.n}>Tokens</th>
          <th>Parte</th>
          <th className={styles.n}>Equiv. API</th>
        </tr>
      </thead>
      <tbody>
        {top.map((r) => (
          <tr key={r.key}>
            <td className={styles.proj} title={r.key}>
              {projectLabel(r.key)}
            </td>
            <td className={styles.n}>{r.sessions}</td>
            <td className={styles.n}>{formatTokens(rowTokens(r))}</td>
            <td>
              {bar(r.costUsd)}
              <span className={styles.muted}>{pct(r.costUsd, total)}</span>
            </td>
            <td className={styles.n} data-testid="project-cost">
              {formatUsd(r.costUsd)}
            </td>
          </tr>
        ))}
        {rest.length > 0 && (
          <tr>
            <td className={styles.proj}>Otros ({rest.length})</td>
            {/* Una sesión puede abarcar varios directorios: sumarlas contaría de más. */}
            <td className={styles.n}>—</td>
            <td className={styles.n}>{formatTokens(restTokens)}</td>
            <td>
              {bar(restCost)}
              <span className={styles.muted}>{pct(restCost, total)}</span>
            </td>
            <td className={styles.n} data-testid="project-cost">
              {formatUsd(restCost)}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** `series` son las series de la gráfica de coste: cada fila lleva el color
 * de su familia, y lo que la gráfica junta en "Otros" sale con el de "Otros". */
export function ModelsTable({
  rows,
  series,
}: {
  rows: ModelTotal[];
  series: string[];
}) {
  const colorOf = (model: string) => {
    const i = series.indexOf(modelFamily(model));
    return SERIES_VAR[i === -1 ? series.length - 1 : i];
  };
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Modelo</th>
          <th className={styles.n}>Tokens</th>
          <th className={styles.n}>Equiv. API</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.model}>
            <td>
              <span
                className={styles.swatch}
                style={{ background: `var(${colorOf(r.model)})` }}
              />
              {modelLabel(r.model)}
            </td>
            <td className={styles.n}>{formatTokens(r.tokens)}</td>
            <td className={styles.n}>{formatUsd(r.costUsd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TokenTypeTable({ totals }: { totals: TokenTypeTotals }) {
  const rows: [string, number][] = [
    ["Lectura de caché", totals.cacheRead],
    ["Escritura de caché", totals.cacheWrite],
    ["Salida", totals.output],
    ["Entrada", totals.input],
  ];
  return (
    <table className={styles.table}>
      <tbody>
        {rows.map(([label, n]) => (
          <tr key={label}>
            <td>{label}</td>
            <td className={styles.n}>{formatTokens(n)}</td>
            <td className={`${styles.n} ${styles.muted}`}>
              {pct(n, totals.total)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
