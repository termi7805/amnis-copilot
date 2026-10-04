import { VERSION } from "../../../config.ts";

/** `AMNIS_RELEASES_URL` existe para probar a mano contra un servidor local. */
const RELEASES_URL =
  process.env.AMNIS_RELEASES_URL ??
  "https://api.github.com/repos/termi7805/amnis-copilot/releases/latest";
const RELEASE_PAGE_PREFIX =
  "https://github.com/termi7805/amnis-copilot/releases/";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface FetchLatestReleaseOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type LatestRelease = { tag: string; url: string } | { error: string };

/**
 * Nunca lanza: red, no-2xx o un cuerpo sin `tag_name` son `{error}`. Una
 * `html_url` fuera de las releases del repo también: es lo que la mascota
 * abrirá en el navegador.
 */
export async function fetchLatestRelease(
  opts: FetchLatestReleaseOptions = {},
): Promise<LatestRelease> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let body: unknown;
  try {
    const response = await fetchImpl(RELEASES_URL, {
      headers: {
        // GitHub rechaza las peticiones sin User-Agent.
        "User-Agent": `amnis-copilot/${VERSION}`,
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { error: `GitHub respondió ${response.status}.` };
    }
    body = await response.json();
  } catch (err) {
    return {
      error: `Fallo de red al buscar actualizaciones: ${(err as Error).message}.`,
    };
  }

  const { tag_name: tag, html_url: url } = (body ?? {}) as Record<
    string,
    unknown
  >;
  if (typeof tag !== "string" || typeof url !== "string") {
    return { error: "La última release no trae tag_name ni html_url." };
  }
  if (!url.startsWith(RELEASE_PAGE_PREFIX)) {
    return { error: `La release apunta fuera del repositorio: ${url}.` };
  }
  return { tag, url };
}
