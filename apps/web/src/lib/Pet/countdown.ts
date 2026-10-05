/** `2h 05m` hasta `resetsAt`; vacío sin dato. Lo comparten la escena de BIT y las skins. */
export function countdownText(
  resetsAt: string | null | undefined,
  now = Date.now(),
): string {
  if (!resetsAt) return "";
  const minutes = Math.max(
    0,
    Math.round((new Date(resetsAt).getTime() - now) / 60_000),
  );
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
