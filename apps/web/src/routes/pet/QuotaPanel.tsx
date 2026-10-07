import type {
  MusicPrefs,
  PetSnapshot,
  ProviderId,
  QuotaLimit,
  QuotaSnapshot,
} from "@amnis/shared";
import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { postAction } from "../../api/actions.ts";
import type { ConnectionStatus } from "../../api/useAmnisStream.ts";
import { daemonText, dateFormat } from "../../i18n/index.ts";
import { formatElapsed, formatUntil } from "../../lib/countdown.ts";
import { fiveHourExhaustion, fiveHourWindow } from "../../lib/fiveHour.ts";
import { scopeTitle } from "../../lib/nowCards.ts";
import type { PetSkin } from "../../lib/Pet/SkinScene.tsx";
import { extraLimits } from "../../lib/quotaLimits.ts";
import type { SessionCarouselState } from "../../lib/SessionCarousel/SessionCarousel.tsx";
import { QuotaRing } from "../dashboard/QuotaRing.tsx";
import { ActivityRow } from "./ActivityRow.tsx";
import { PanelHeader, type PanelId } from "./PanelHeader.tsx";
import styles from "./QuotaPanel.module.css";

/** Lista indexada por proveedor aunque hoy solo exista Claude — mismo
 * criterio que `account_id` (issue #42): barato en la estructura, caro
 * como refactorización si se añade Antigravity más tarde. */
const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: "Claude",
};

const RING_SIZE = 54;

/** `limit.label` es un identificador de la API: la etiqueta sale del `scope`. */
function extraLimitLabel(limit: QuotaLimit, t: TFunction): string {
  if (limit.scope === null) return t("pet.ring.otherLimit");
  const name = scopeTitle(limit.scope);
  if (limit.group === "weekly") return t("pet.ring.weeklyScope", { name });
  if (limit.group === "session") return t("pet.ring.sessionScope", { name });
  return name;
}

const hhmm = (date: Date) =>
  dateFormat({ hour: "2-digit", minute: "2-digit" }).format(date);

/** Si no llega un `quota` fresco por SSE en este tiempo (endpoint caído,
 * 429, offline), el icono deja de girar solo — un fallo de red no debe
 * dejarlo animando para siempre. */
const REFRESH_TIMEOUT_MS = 8_000;

export interface QuotaPanelProps {
  pet: PetSnapshot;
  status: ConnectionStatus;
  quotas: QuotaSnapshot[];
  now: Date;
  musicPrefs?: MusicPrefs;
  onSelectPanel?: (panel: PanelId) => void;
  /** Con el foco en «Todas»: la fila para pasar de sesión, bajo el foco. */
  carousel?: SessionCarouselState;
  /** La skin elegida, ya resuelta por `PetWindow` (no se vuelve a pedir aquí). */
  skin?: PetSkin | null;
}

/**
 * Panel desplegable de la ventana flotante (issue #42), diseño 3b: BIT
 * pequeño junto al texto de actividad en vez de a tamaño completo
 * arriba, y los anillos 5h/7d en fila con el 7d atenuado — la
 * jerarquía (qué manda, qué acompaña) se lee sin leer.
 */
export function QuotaPanel({
  pet,
  status,
  quotas,
  now,
  musicPrefs,
  onSelectPanel,
  carousel,
  skin,
}: QuotaPanelProps) {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  // El aviso del último intento que dio 429 (#116): los anillos conservan el
  // dato que había y esto explica por qué no se ha actualizado.
  const [notice, setNotice] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Cualquier `quota` fresco (el nuestro o el del siguiente tick de los
  // 180s) apaga el spinner — no hace falta correlacionar cuál lo trajo.
  // Sin array de dependencias (corre en cada render) porque el propio
  // valor a vigilar es la referencia de `quotas`, que no se lee dentro
  // del efecto — un array de deps con algo que no se usa es justo lo
  // que `useExhaustiveDependencies` rechaza.
  const prevQuotasRef = useRef(quotas);
  useEffect(() => {
    if (prevQuotasRef.current !== quotas) {
      setRefreshing(false);
      setNotice(null);
      clearTimeout(timeoutRef.current);
      prevQuotasRef.current = quotas;
    }
  });

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  function handleRefresh() {
    setRefreshing(true);
    setNotice(null);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(
      () => setRefreshing(false),
      REFRESH_TIMEOUT_MS,
    );
    // El daemon responde al terminar el sondeo: con 429 deja de girar y avisa.
    postAction("/api/quota/refresh").then((result) => {
      setRefreshing(false);
      clearTimeout(timeoutRef.current);
      if (!result.ok) setNotice(result.message);
    });
  }

  return (
    <div className={styles.panel}>
      <PanelHeader
        status={status}
        active="quota"
        onSelect={onSelectPanel}
        focus={pet.focus}
        now={now}
        carousel={carousel}
      />

      <ActivityRow
        pet={pet}
        status={status}
        resetsAt={quotas[0]?.authoritative?.fiveHour.resetsAt ?? null}
        now={now}
        musicPrefs={musicPrefs}
        identity={carousel?.current?.session.identity}
        skin={skin}
      />

      {quotas.map((quota, i) => {
        // La mascota solo avisa cuando se agota antes del reset (#119).
        const exhaustion = fiveHourExhaustion(
          quota,
          fiveHourWindow(quota, now),
        );
        return (
          <section key={quota.provider} className={styles.provider}>
            <div className={styles.providerRow}>
              <h2 className={styles.providerLabel}>
                {PROVIDER_LABEL[quota.provider]}
              </h2>
              {i === 0 && (
                <button
                  type="button"
                  className={styles.refreshButton}
                  data-refreshing={refreshing}
                  onClick={handleRefresh}
                  // La ventana entera alterna plegado/desplegado con el
                  // mismo gesto de clic (PetWindow.tsx) — sin cortar la
                  // propagación aquí, pulsar este botón también dispara
                  // ese toggle y el panel se plegaba solo al recargar.
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  disabled={refreshing}
                  aria-label={t("pet.window.refreshQuota")}
                  title={t("pet.window.refreshQuota")}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="11"
                    height="11"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M20 11a8 8 0 1 0-2.34 5.66M20 5v6h-6"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
            {i === 0 && notice && (
              <p className={styles.error} role="status">
                {notice}
              </p>
            )}
            {quota.error && (
              <p className={styles.error}>{daemonText(quota.error)}</p>
            )}
            {quota.rateLimitedAt && quota.authoritative && (
              <p className={styles.stale}>
                {t("pet.window.stale", {
                  elapsed: formatElapsed(quota.sampledAt, now),
                })}
              </p>
            )}
            <div className={styles.rings}>
              <div className={styles.ringCell}>
                <QuotaRing
                  label="5h"
                  authoritative={quota.authoritative?.fiveHour ?? null}
                  estimated={quota.local.fiveHourUtilization}
                  now={now}
                  size={RING_SIZE}
                  layout="row"
                />
              </div>
              <div className={styles.ringCell}>
                <QuotaRing
                  label="7d"
                  authoritative={quota.authoritative?.sevenDay ?? null}
                  estimated={null}
                  now={now}
                  size={RING_SIZE}
                  layout="row"
                  tone="muted"
                />
              </div>
              {extraLimits(quota.authoritative?.limits ?? []).map((limit) => (
                <div
                  key={`${limit.kind}:${limit.scope ?? ""}`}
                  className={styles.ringCell}
                >
                  <QuotaRing
                    label={extraLimitLabel(limit, t)}
                    authoritative={limit}
                    estimated={null}
                    now={now}
                    size={RING_SIZE}
                    layout="row"
                    tone="muted"
                  />
                </div>
              ))}
            </div>
            {exhaustion.kind === "at" && (
              <p className={styles.exhausts} data-testid="exhausts">
                <Trans
                  i18nKey="pet.window.exhausts"
                  values={{
                    time: hhmm(exhaustion.at),
                    countdown:
                      formatUntil(exhaustion.at.toISOString(), now) ?? "",
                  }}
                  components={{ b: <b /> }}
                />
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
