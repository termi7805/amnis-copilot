import { activity } from "./en/activity.ts";
import { common } from "./en/common.ts";
import { focus } from "./en/focus.ts";
import { history } from "./en/history.ts";
import { media } from "./en/media.ts";
import { now } from "./en/now.ts";
import { pet } from "./en/pet.ts";
import { settings } from "./en/settings.ts";
import type { es } from "./es.ts";
import type { Messages } from "./messages.ts";

export const en: Messages<typeof es> = {
  common,
  now,
  pet,
  media,
  focus,
  history,
  activity,
  settings,
};
