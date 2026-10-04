/**
 * `vX.Y.Z` o `X.Y.Z`, nada más: una prerelease (`v1.0.0-rc.1`) o cualquier
 * otra forma da `null`, y quien llama la trata como ilegible.
 */
export function parseVersion(raw: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Compara número a número: `0.10.0` es más nueva que `0.9.0`. */
export function isNewer(
  candidate: readonly number[],
  current: readonly number[],
): boolean {
  for (let i = 0; i < 3; i++) {
    const a = candidate[i] ?? 0;
    const b = current[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}
