import type { Provider } from "../../domain/Provider.ts";
import { anthropicProvider } from "./anthropic/index.ts";

/** Una fila hoy, por la misma razón que `account_id` existe desde el día uno. */
export const providers: readonly Provider[] = [anthropicProvider];
