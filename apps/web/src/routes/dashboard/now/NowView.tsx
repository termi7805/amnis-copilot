import type { StateResponse } from "@amnis/shared";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { postAction } from "../../../api/actions.ts";
import { useTodayActivity } from "../../../api/activity.ts";
import { fetchMediaDevices, sendMediaCommand } from "../../../api/media.ts";
import { useQuotaHistory } from "../../../api/quotaHistory.ts";
import { useTodayUsage } from "../../../api/usage.ts";
import { useNow } from "../../../lib/countdown.ts";
import { fiveHourWindow, paceHeadline } from "../../../lib/fiveHour.ts";
import { MediaPlayer } from "../../../lib/MediaPlayer/MediaPlayer.tsx";
import { chunkRows, modelLimits } from "../../../lib/nowCards.ts";
import { FiveHourCard } from "./FiveHourCard.tsx";
import { ModelLimitCard } from "./ModelLimitCard.tsx";
import styles from "./NowView.module.css";
import { PetHero } from "./PetHero.tsx";
import { RecentEvents } from "./RecentEvents.tsx";
import { TodayCard } from "./TodayCard.tsx";
import { WaitingCard } from "./WaitingCard.tsx";
import { WeeklyCard } from "./WeeklyCard.tsx";

/** Tope del giro si el sondeo no llega a cambiar la muestra (endpoint caído). */
const REFRESH_TIMEOUT_MS = 8_000;

/**
 * Recarga manual de la cuota (#102), la misma que el panel de la mascota: el
 * daemon sondea y responde al terminar; el dato llega por SSE. El botón gira
 * hasta que cambia `sampledAt`, responde el daemon o vence el tope. Con 429
 * (#116) deja de girar y avisa; los datos que había se quedan.
 */
function RefreshButton({ sampledAt }: { sampledAt: string | null }) {
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sampledAt solo dispara el fin del giro
  useEffect(() => {
    setRefreshing(false);
    setNotice(null);
    window.clearTimeout(timer.current);
  }, [sampledAt]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function refresh() {
    setRefreshing(true);
    setNotice(null);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setRefreshing(false),
      REFRESH_TIMEOUT_MS,
    );
    const result = await postAction("/api/quota/refresh");
    // El daemon responde al terminar el sondeo: ya no hay nada que esperar.
    setRefreshing(false);
    window.clearTimeout(timer.current);
    if (!result.ok) setNotice(result.message);
  }

  return (
    <div className={styles.refreshGroup}>
      <button
        type="button"
        className={styles.refresh}
        data-refreshing={refreshing}
        disabled={refreshing || sampledAt === null}
        onClick={refresh}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
        </svg>
        Actualizar cuota
      </button>
      {notice && (
        <p className={styles.refreshNotice} role="status">
          {notice}
        </p>
      )}
    </div>
  );
}

const EYEBROW = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * La portada. Arriba manda la ventana de 5 h junto a Amnis (#91); debajo,
 * lo que la acompaña (#92): la semana, un límite por cada modelo que tenga la
 * cuenta, lo de hoy y lo que Amnis esperó, más el reproductor y los últimos
 * eventos.
 */
export function NowView({ state }: { state: StateResponse | null }) {
  const now = useNow();
  const quota = state?.quotas[0] ?? null;
  const window = quota ? fiveHourWindow(quota, now) : null;
  const samples = useQuotaHistory(
    window?.start ?? new Date(now.getTime() - 5 * 60 * 60_000),
    quota?.sampledAt ?? "",
  );
  // Cada cambio de estado de Amnis (llega por SSE), cada sondeo de cuota y
  // cada minuto del reloj de la vista refrescan "Hoy", "Te esperó" y los
  // eventos. El minuto cubre lo que no cambia de estado: mientras Amnis espera
  // un permiso los minutos de espera crecen sin ninguna transición, y con dos
  // sesiones el estado global puede no cambiar aunque la actividad sí.
  const minute = Math.floor(now.getTime() / 60_000);
  const refreshKey = `${state?.pet.since ?? ""}|${quota?.sampledAt ?? ""}|${minute}`;
  const activity = useTodayActivity(refreshKey);
  const usage = useTodayUsage(refreshKey);
  const headline =
    quota && window
      ? paceHeadline(window, quota.projection.fiveHourAtReset)
      : null;

  const cards: { key: string; node: ReactNode }[] = [
    ...(quota
      ? [
          {
            key: "weekly",
            node: <WeeklyCard key="weekly" quota={quota} now={now} />,
          },
        ]
      : []),
    ...modelLimits(quota?.authoritative?.limits ?? []).map((limit) => ({
      key: `model:${limit.kind}:${limit.scope}`,
      node: (
        <ModelLimitCard
          key={`model:${limit.kind}:${limit.scope}`}
          limit={limit}
          now={now}
        />
      ),
    })),
    {
      key: "today",
      node: <TodayCard key="today" usage={usage} activity={activity} />,
    },
    { key: "waiting", node: <WaitingCard key="waiting" activity={activity} /> },
  ];

  return (
    <section className={styles.view}>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>{EYEBROW.format(now)}</p>
          <h1>{headline?.title ?? "Conectando con el daemon…"}</h1>
          {headline && <p>{headline.detail}</p>}
        </div>
        <RefreshButton sampledAt={quota?.sampledAt ?? null} />
      </header>

      {state && (
        <div className={styles.grid}>
          <div className={styles.hero}>
            <PetHero state={state} now={now} />
          </div>
          {quota && (
            <div className={styles.window}>
              <FiveHourCard quota={quota} samples={samples} now={now} />
            </div>
          )}
        </div>
      )}

      <div className={styles.cards}>
        {chunkRows(cards).map((row) => (
          <div
            key={row.map((c) => c.key).join("|")}
            className={styles.cardRow}
            style={{ "--cols": row.length } as CSSProperties}
          >
            {row.map((c) => c.node)}
          </div>
        ))}
      </div>

      <div className={styles.lower}>
        <article className={styles.player}>
          <div className={styles.playerHead}>
            <h2>Sonando</h2>
            <span className={styles.eyebrow}>Spotify Connect</span>
          </div>
          <MediaPlayer
            layout="wide"
            media={state?.media ?? null}
            onCommand={sendMediaCommand}
            loadDevices={fetchMediaDevices}
          />
        </article>
        <div className={styles.events}>
          <RecentEvents activity={activity} />
        </div>
      </div>
    </section>
  );
}
