import type { AmnisSettings } from "@amnis/shared";
import i18n from "../i18n/index.ts";
import { errorMessage } from "./actions.ts";
import { daemonUrl } from "./config.ts";

export type SaveSettingsResult = { ok: true } | { ok: false; message: string };

/**
 * `PUT /api/settings` acepta un parcial y valida cada campo. El estado nuevo
 * vuelve a todos los clientes por el evento SSE `settings`, así que aquí solo
 * se informa del fallo: no hace falta leer el cuerpo de la respuesta.
 */
export async function saveSettings(
  partial: Partial<AmnisSettings>,
): Promise<SaveSettingsResult> {
  let response: Response;
  try {
    response = await fetch(`${daemonUrl()}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
  } catch {
    return { ok: false, message: i18n.t("common.errors.unreachable") };
  }
  if (response.ok) return { ok: true };
  return { ok: false, message: await errorMessage(response) };
}
