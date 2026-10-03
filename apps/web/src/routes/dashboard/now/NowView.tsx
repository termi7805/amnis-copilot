import type { StateResponse } from "@amnis/shared";
import type { CSSProperties, ReactNode } from "react";
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
        <p className={styles.eyebrow}>{EYEBROW.format(now)}</p>
        <h1>{headline?.title ?? "Conectando con el daemon…"}</h1>
        {headline && <p>{headline.detail}</p>}
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
