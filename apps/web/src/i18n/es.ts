import { activity } from "./es/activity.ts";
import { common } from "./es/common.ts";
import { focus } from "./es/focus.ts";
import { history } from "./es/history.ts";
import { media } from "./es/media.ts";
import { now } from "./es/now.ts";
import { pet } from "./es/pet.ts";
import { settings } from "./es/settings.ts";

/** Recurso de referencia: `en` se tipa contra este objeto. */
export const es = {
  common,
  now,
  pet,
  media,
  focus,
  history,
  activity,
  settings,
} as const;
