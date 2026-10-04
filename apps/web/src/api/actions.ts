import i18n from "../i18n/index.ts";
import { daemonUrl } from "./config.ts";

export type ActionResult<T = unknown> =
  | { ok: true; body: T }
  | { ok: false; message: string };

/** El daemon responde `{ error }` en español (no se traduce); si no hay, basta el status. */
export async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    // Cuerpo que no es JSON: el status basta.
  }
  return i18n.t("common.errors.status", { status: response.status });
}

/** POST sin cuerpo a una ruta de acción del daemon (reparar, reconstruir…). */
export async function postAction<T = unknown>(
  path: string,
): Promise<ActionResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${daemonUrl()}${path}`, { method: "POST" });
  } catch {
    return { ok: false, message: i18n.t("common.errors.unreachable") };
  }
  if (!response.ok) return { ok: false, message: await errorMessage(response) };
  try {
    return { ok: true, body: (await response.json()) as T };
  } catch {
    return { ok: true, body: {} as T };
  }
}
