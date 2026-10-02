import type { ModelPrices, PriceTable } from "../../../domain/cost.ts";

/**
 * La página de precios servida como markdown. La Models API
 * (`GET /v1/models`) no expone precios: esta es la única fuente oficial
 * legible por máquina. `AMNIS_PRICING_URL` existe para probar a mano una
 * página caída o con otro formato.
 */
const PRICING_URL =
  process.env.AMNIS_PRICING_URL ??
  "https://platform.claude.com/docs/en/about-claude/pricing.md";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Columnas buscadas por nombre, nunca por posición. */
const COLUMNS = {
  input: "base input tokens",
  cacheWrite: "5m cache writes",
  cacheWrite1h: "1h cache writes",
  cacheRead: "cache hits and refreshes",
  output: "output tokens",
} satisfies Record<keyof ModelPrices, string>;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** `Claude Opus 4.1 ([retired, …](…))` → `claude-opus-4-1`. */
function modelIdFromName(name: string): string {
  return name
    .replace(/\(.*\)/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s.]+/g, "-");
}

/** `$0.25 / MTok<sup>1</sup>` → 0.25. NaN si la celda no tiene esa forma. */
function priceFromCell(cell: string): number {
  const match = cell
    .replace(/<sup>.*?<\/sup>/g, "")
    .match(/^\$([\d.]+)\s*\/\s*MTok$/);
  return match ? Number(match[1]) : Number.NaN;
}

/**
 * Parsear una página de documentación es frágil, así que ante la duda se
 * descarta la tabla entera (`null`) en vez de devolver una parcial: sin
 * cabecera, sin alguna columna, sin filas o con algún precio ilegible.
 * Quien llama conserva entonces los últimos precios buenos.
 */
export function parsePricingMarkdown(md: string): PriceTable | null {
  const lines = md.split("\n");
  const headerIndex = lines.findIndex(
    (line) =>
      line.trim().startsWith("|") &&
      cells(line).some((cell) => cell.toLowerCase() === COLUMNS.input),
  );
  if (headerIndex === -1) return null;

  const header = cells(lines[headerIndex] ?? "").map((c) => c.toLowerCase());
  const modelColumn = header.indexOf("model");
  const columnIndex = {} as Record<keyof ModelPrices, number>;
  for (const [key, name] of Object.entries(COLUMNS)) {
    const index = header.indexOf(name);
    if (index === -1) return null;
    columnIndex[key as keyof ModelPrices] = index;
  }
  if (modelColumn === -1) return null;

  const table: PriceTable = {};
  // headerIndex + 1 es la fila separadora `| :--- |`.
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith("|")) break;
    const row = cells(line);
    const prices = {} as ModelPrices;
    for (const [key, index] of Object.entries(columnIndex)) {
      const price = priceFromCell(row[index] ?? "");
      if (!(price > 0)) return null;
      prices[key as keyof ModelPrices] = price;
    }
    table[modelIdFromName(row[modelColumn] ?? "")] = prices;
  }

  return Object.keys(table).length > 0 ? table : null;
}

export interface FetchPricesOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type PricesReading = { prices: PriceTable } | { error: string };

/** Nunca lanza: red, no-2xx o formato irreconocible son `{error}`. */
export async function fetchPrices(
  opts: FetchPricesOptions = {},
): Promise<PricesReading> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let body: string;
  try {
    const response = await fetchImpl(PRICING_URL, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return {
        error: `La página de precios respondió ${response.status}.`,
      };
    }
    body = await response.text();
  } catch (err) {
    return {
      error: `Fallo de red al descargar los precios: ${(err as Error).message}.`,
    };
  }

  const prices = parsePricingMarkdown(body);
  if (!prices) {
    return { error: "La página de precios tiene un formato irreconocible." };
  }
  return { prices };
}
