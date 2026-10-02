import type { Listening, PetSnapshot, PetState, Vibe } from "@amnis/shared";
import type { CSSProperties } from "react";
import { Headphones } from "./Headphones.tsx";
import { MusicFx } from "./MusicFx.tsx";
import {
  amplitude,
  beatSeconds,
  DEFAULT_MUSIC_PREFS,
  layerColor,
  type MusicPrefs,
  useLayerPresence,
} from "./musicLayer.ts";
import styles from "./Pet.module.css";

export interface PetProps {
  state: PetSnapshot["state"];
  level: number;
  fatigue: number;
  /** ISO8601, reset de la ventana de 5h. Solo lo usa la escena `limited`
   * (cartel de cuenta atrás) — `null` cuando no hay dato autoritativo. */
  resetsAt?: string | null;
  /** Solo lo usa la escena `pushing` (sello sobre la caja). `null` en
   * cualquier otro estado, o si el daemon no pudo leer `HEAD`. */
  commitHash?: string | null;
  /** Qué suena (`PetSnapshot.listening`). Con valor, Amnis lleva cascos —
   * salvo en `waiting` y `limited`, que piden atención y no llevan nada. */
  listening?: Listening | null;
  /** Lo que no se indique toma el valor por defecto. */
  musicPrefs?: Partial<MusicPrefs>;
}

/**
 * Español, para `<title>` — describe el estado, no lo repite literal.
 * `Record<PetState, …>` exhaustivo: un estado nuevo sin entrada aquí no
 * compila, la mascota nunca se queda muda ante un estado real
 * (docs/DESIGN.md §4).
 */
export const STATE_TITLE: Record<PetState, string> = {
  coding: "Escribiendo código",
  testing: "Corriendo tests",
  researching: "Buscando información",
  planning: "Planificando",
  waiting: "Esperando permiso",
  resting: "Descansando",
  sleeping: "Durmiendo",
  terminal: "Ejecutando un comando",
  subagents: "Repartiendo trabajo",
  committing: "Haciendo commit",
  pushing: "Subiendo al remoto",
  limited: "Límite alcanzado",
};

/**
 * docs/DESIGN.md §4: "fresca al 10%, agotada al 85%, revive en el
 * reset". El tramo por debajo de 0.10 y por encima de 0.85 satura en
 * vez de extrapolar, para que el 0-10% siga leyéndose como "fresca".
 */
export function fatigueLevel(fatigue: number): number {
  const t = (fatigue - 0.1) / (0.85 - 0.1);
  return Math.min(1, Math.max(0, t));
}

/**
 * BIT, robot de sobremesa, interactuando con un objeto propio por
 * estado (variante 2a del proyecto de diseño "Mascota IA con siete
 * estados"). `data-look` conserva un valor distinto por estado para
 * que el estado se lea por la escena, no solo por `<title>`.
 */
function Scene({
  state,
  resetsAt,
  commitHash,
  music,
}: {
  state: PetState;
  resetsAt?: string | null;
  commitHash?: string | null;
  /** `undefined` = sin capa de música. */
  music?: { vibe: Vibe; color: string; visible: boolean };
}) {
  switch (state) {
    case "coding":
      return (
        <g data-look="coding">
          <ellipse cx="55" cy="99" rx="26" ry="2.8" fill="rgba(23,29,38,.12)" />
          <g
            className={styles.animated}
            style={{
              transformOrigin: "55px 99px",
              animation: `${styles["pet-bob"]} var(--t) ease-in-out infinite`,
            }}
          >
            <rect x="35" y="72" width="40" height="20" rx="4" fill="#3C4552" />
            <rect
              x="41"
              y="78"
              width="28"
              height="2.2"
              rx="1.1"
              fill="#2A313B"
            />
            <rect x="38" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="60" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <g
              className={styles.animated}
              style={{
                transformOrigin: "34px 76px",
                animation: `${styles["pet-tapA2"]} calc(var(--t)*.5) ease-in-out infinite`,
              }}
            >
              <path
                d="M34 76l-7 5v6"
                fill="none"
                stroke="#2F3742"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="34" cy="76" r="4.6" fill="#2F3742" />
            </g>
            <g
              className={styles.animated}
              style={{
                transformOrigin: "76px 76px",
                animation: `${styles["pet-tapA2"]} calc(var(--t)*.5) ease-in-out .25s infinite`,
              }}
            >
              <path
                d="M76 76l12 4 12 2"
                fill="none"
                stroke="#2F3742"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="76" cy="76" r="4.6" fill="#2F3742" />
              <circle cx="102" cy="82" r="4.2" fill="#2F3742" />
            </g>
            <g className={styles.head}>
              <line
                x1="55"
                y1="22"
                x2="55"
                y2="14"
                stroke="#3C4552"
                strokeWidth="2.6"
              />
              <circle cx="55" cy="12" r="3.4" className={styles.antenna} />
              <rect
                x="24"
                y="22"
                width="62"
                height="48"
                rx="7"
                fill="#4A5563"
              />
              <rect
                x="28"
                y="26"
                width="54"
                height="40"
                rx="5"
                fill="#171D26"
              />
              {music && <Headphones {...music} />}
              <g
                stroke="#39E0C8"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".6"
              >
                <line x1="38" y1="35" x2="49" y2="37.5" />
                <line x1="72" y1="35" x2="61" y2="37.5" />
              </g>
              <g
                className={styles.animated}
                style={{
                  transformOrigin: "55px 46px",
                  animation: `${styles["pet-blink"]} calc(var(--t)*4.5) ease-in-out infinite`,
                }}
              >
                <rect
                  x="40"
                  y="41"
                  width="9"
                  height="9"
                  rx="1"
                  fill="#39E0C8"
                />
                <rect
                  x="61"
                  y="41"
                  width="9"
                  height="9"
                  rx="1"
                  fill="#39E0C8"
                />
              </g>
              <g fill="#39E0C8" opacity=".6">
                <rect x="47" y="56" width="4" height="2.6" />
                <rect x="53" y="56" width="4" height="2.6" />
                <rect x="59" y="56" width="4" height="2.6" />
              </g>
            </g>
          </g>
          <clipPath id="amnis-pet-lap-screen">
            <rect x="97" y="51" width="42" height="31" rx="1" />
          </clipPath>
          <ellipse cx="118" cy="94" rx="32" ry="2.4" fill="rgba(23,29,38,.1)" />
          <rect x="94" y="47" width="48" height="38" rx="2.5" fill="#4A5563" />
          <rect x="97" y="51" width="42" height="31" rx="1" fill="#171D26" />
          <g clipPath="url(#amnis-pet-lap-screen)">
            <g
              className={styles.animated}
              style={{
                animation: `${styles["pet-codeScroll"]} calc(var(--t)*2.4) steps(4,end) infinite`,
              }}
            >
              <g fill="#39E0C8" opacity=".75">
                <rect x="100" y="54" width="20" height="2.4" />
                <rect x="104" y="60" width="26" height="2.4" />
                <rect x="104" y="66" width="14" height="2.4" />
                <rect x="100" y="72" width="23" height="2.4" />
                <rect x="104" y="78" width="18" height="2.4" />
                <rect x="100" y="84" width="27" height="2.4" />
                <rect x="104" y="90" width="16" height="2.4" />
                <rect x="100" y="96" width="22" height="2.4" />
              </g>
              <rect
                x="125"
                y="77"
                width="3"
                height="4"
                fill="#39E0C8"
                className={styles.animated}
                style={{
                  animation: `${styles["pet-cursor"]} 1s step-end infinite`,
                }}
              />
            </g>
          </g>
          <rect x="88" y="85" width="60" height="6" rx="1.5" fill="#C6D0DA" />
          <rect x="88" y="85" width="60" height="1.6" fill="#DCE4EB" />
          <g fill="#39E0C8">
            <rect
              x="99"
              y="87"
              width="6"
              height="3"
              rx="1"
              className={styles.animated}
              style={{
                animation: `${styles["pet-keyLite"]} calc(var(--t)*.5) ease-in-out infinite`,
              }}
            />
            <rect
              x="108"
              y="87"
              width="6"
              height="3"
              rx="1"
              className={styles.animated}
              style={{
                animation: `${styles["pet-keyLite"]} calc(var(--t)*.5) ease-in-out .12s infinite`,
              }}
            />
            <rect
              x="117"
              y="87"
              width="6"
              height="3"
              rx="1"
              className={styles.animated}
              style={{
                animation: `${styles["pet-keyLite"]} calc(var(--t)*.5) ease-in-out .25s infinite`,
              }}
            />
            <rect
              x="126"
              y="87"
              width="6"
              height="3"
              rx="1"
              className={styles.animated}
              style={{
                animation: `${styles["pet-keyLite"]} calc(var(--t)*.5) ease-in-out .37s infinite`,
              }}
            />
            <rect
              x="135"
              y="87"
              width="6"
              height="3"
              rx="1"
              className={styles.animated}
              style={{
                animation: `${styles["pet-keyLite"]} calc(var(--t)*.5) ease-in-out .5s infinite`,
              }}
            />
          </g>
        </g>
      );
    case "testing":
      return (
        <g data-look="testing">
          <ellipse cx="55" cy="99" rx="26" ry="2.8" fill="rgba(23,29,38,.12)" />
          <g
            className={styles.animated}
            style={{
              transformOrigin: "55px 99px",
              animation: `${styles["pet-bob2"]} calc(var(--t)*1.6) ease-in-out infinite`,
            }}
          >
            <rect x="35" y="72" width="40" height="20" rx="4" fill="#3C4552" />
            <rect
              x="41"
              y="78"
              width="28"
              height="2.2"
              rx="1.1"
              fill="#2A313B"
            />
            <rect x="38" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="60" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="25" y="72" width="8" height="15" rx="4" fill="#2F3742" />
            <g
              className={styles.animated}
              style={{
                transformOrigin: "76px 76px",
                animation: `${styles["pet-tapA2"]} calc(var(--t)*3.2) ease-in-out infinite`,
              }}
            >
              <path
                d="M76 76l10-5 9-6"
                fill="none"
                stroke="#2F3742"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="76" cy="76" r="4.6" fill="#2F3742" />
              <circle cx="95" cy="65" r="4" fill="#2F3742" />
            </g>
            <g className={styles.head}>
              <line
                x1="55"
                y1="22"
                x2="55"
                y2="14"
                stroke="#3C4552"
                strokeWidth="2.6"
              />
              <circle cx="55" cy="12" r="3.4" className={styles.antenna} />
              <rect
                x="24"
                y="22"
                width="62"
                height="48"
                rx="7"
                fill="#4A5563"
              />
              <rect
                x="28"
                y="26"
                width="54"
                height="40"
                rx="5"
                fill="#171D26"
              />
              {music && <Headphones {...music} />}
              <g
                stroke="#39E0C8"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".55"
              >
                <line x1="39" y1="37" x2="50" y2="37" />
                <line x1="60" y1="38.5" x2="71" y2="34.5" />
              </g>
              <rect
                x="39"
                y="44"
                width="11"
                height="3.4"
                rx="1.7"
                fill="#39E0C8"
              />
              <rect
                x="60"
                y="44"
                width="11"
                height="3.4"
                rx="1.7"
                fill="#39E0C8"
              />
              <circle
                cx="55"
                cy="57.5"
                r="2.6"
                fill="none"
                stroke="#39E0C8"
                strokeWidth="2"
                opacity=".6"
              />
            </g>
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "120px 90px",
              animation: `${styles["pet-swing"]} calc(var(--t)*4) ease-in-out infinite`,
            }}
          >
            <rect
              x="100"
              y="30"
              width="42"
              height="58"
              rx="2"
              fill="#F7F9FB"
              stroke="#C6D0DA"
              strokeWidth="1.4"
            />
            <rect x="112" y="26" width="18" height="7" rx="2" fill="#4A5563" />
            <g stroke="#C6D0DA" strokeWidth="1.6">
              <rect x="105" y="40" width="7" height="7" fill="none" />
              <rect x="105" y="52" width="7" height="7" fill="none" />
              <rect x="105" y="64" width="7" height="7" fill="none" />
            </g>
            <g fill="#C6D0DA">
              <rect x="116" y="42" width="21" height="2.4" />
              <rect x="116" y="54" width="18" height="2.4" />
              <rect x="116" y="66" width="22" height="2.4" />
            </g>
            <g
              fill="none"
              stroke="#1FB98C"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                d="M106 43.5l2.4 2.6 4.4-5"
                className={styles.animated}
                style={{
                  transformOrigin: "109px 44px",
                  animation: `${styles["pet-popIn"]} calc(var(--t)*3.4) ease-out infinite`,
                }}
              />
              <path
                d="M106 55.5l2.4 2.6 4.4-5"
                className={styles.animated}
                style={{
                  transformOrigin: "109px 56px",
                  animation: `${styles["pet-popIn"]} calc(var(--t)*3.4) ease-out 1.1s infinite`,
                }}
              />
              <path
                d="M106 67.5l2.4 2.6 4.4-5"
                className={styles.animated}
                style={{
                  transformOrigin: "109px 68px",
                  animation: `${styles["pet-popIn"]} calc(var(--t)*3.4) ease-out 2.2s infinite`,
                }}
              />
            </g>
            <rect x="105" y="78" width="32" height="4" rx="2" fill="#DCE4EB" />
            <rect
              x="105"
              y="78"
              width="32"
              height="4"
              rx="2"
              fill="#1FB98C"
              className={styles.animated}
              style={{
                transformOrigin: "105px 80px",
                animation: `${styles["pet-fillX"]} calc(var(--t)*3.4) linear infinite`,
              }}
            />
          </g>
        </g>
      );
    case "researching":
      return (
        <g data-look="researching">
          <ellipse cx="55" cy="99" rx="26" ry="2.8" fill="rgba(23,29,38,.12)" />
          <rect x="35" y="72" width="40" height="20" rx="4" fill="#3C4552" />
          <rect x="41" y="78" width="28" height="2.2" rx="1.1" fill="#2A313B" />
          <rect x="38" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
          <rect x="60" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
          <rect x="25" y="72" width="8" height="15" rx="4" fill="#2F3742" />
          <g className={styles.head}>
            <line
              x1="55"
              y1="22"
              x2="55"
              y2="14"
              stroke="#3C4552"
              strokeWidth="2.6"
            />
            <circle cx="55" cy="12" r="3.4" className={styles.antenna} />
            <rect x="24" y="22" width="62" height="48" rx="7" fill="#4A5563" />
            <rect x="28" y="26" width="54" height="40" rx="5" fill="#171D26" />
            {music && <Headphones {...music} />}
            <g
              stroke="#39E0C8"
              strokeWidth="2"
              strokeLinecap="round"
              opacity=".5"
            >
              <path d="M38 35.5q5.5-3 11 0" />
              <path d="M61 35.5q5.5-3 11 0" />
            </g>
            <g
              className={styles.animated}
              style={{
                animation: `${styles["pet-scanX"]} calc(var(--t)*2.4) ease-in-out infinite`,
              }}
            >
              <circle cx="44.5" cy="45" r="6.4" fill="#39E0C8" />
              <circle cx="65.5" cy="45" r="6.4" fill="#39E0C8" />
              <circle cx="46.8" cy="45" r="2.6" fill="#171D26" />
              <circle cx="67.8" cy="45" r="2.6" fill="#171D26" />
            </g>
            <path
              d="M50 57.5q2.5-3 5 0t5 0"
              fill="none"
              stroke="#39E0C8"
              strokeWidth="1.9"
              strokeLinecap="round"
              opacity=".65"
            />
          </g>
          <g transform="rotate(-4 120 62)">
            <rect
              x="98"
              y="34"
              width="42"
              height="54"
              rx="1.5"
              fill="#EEF2F6"
              stroke="#C6D0DA"
              strokeWidth="1.2"
            />
          </g>
          <rect
            x="96"
            y="30"
            width="42"
            height="54"
            rx="1.5"
            fill="#FCFDFE"
            stroke="#C6D0DA"
            strokeWidth="1.4"
          />
          <g fill="#C6D0DA">
            <rect x="102" y="38" width="26" height="2.6" />
            <rect x="102" y="46" width="30" height="2.2" />
            <rect x="102" y="53" width="22" height="2.2" />
            <rect x="102" y="60" width="28" height="2.2" />
            <rect x="102" y="67" width="18" height="2.2" />
            <rect x="102" y="74" width="25" height="2.2" />
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "117px 57px",
              animation: `${styles["pet-lensXY"]} calc(var(--t)*4.4) ease-in-out infinite`,
            }}
          >
            <circle cx="117" cy="57" r="11" fill="#fff" fillOpacity=".92" />
            <g fill="#8AA0B4">
              <rect x="109" y="53" width="16" height="3.4" />
              <rect x="109" y="59" width="11" height="3.4" />
            </g>
            <circle
              cx="117"
              cy="57"
              r="11"
              fill="none"
              stroke="#171D26"
              strokeWidth="2.6"
            />
            <line
              x1="125"
              y1="65"
              x2="133"
              y2="73"
              stroke="#171D26"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "76px 76px",
              animation: `${styles["pet-tapA2"]} calc(var(--t)*4.4) ease-in-out infinite`,
            }}
          >
            <path
              d="M76 76l11-2 8-4"
              fill="none"
              stroke="#2F3742"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="76" cy="76" r="4.6" fill="#2F3742" />
            <circle cx="95" cy="70" r="4" fill="#2F3742" />
          </g>
        </g>
      );
    case "planning":
      return (
        <g data-look="planning">
          <ellipse cx="55" cy="101" rx="24" ry="2.6" fill="rgba(23,29,38,.1)" />
          <g
            className={styles.animated}
            style={{
              animation: `${styles["pet-drift"]} calc(var(--t)*2.6) ease-in-out infinite`,
            }}
          >
            <rect x="35" y="72" width="40" height="20" rx="4" fill="#3C4552" />
            <rect
              x="41"
              y="78"
              width="28"
              height="2.2"
              rx="1.1"
              fill="#2A313B"
            />
            <rect x="38" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="60" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <g
              className={styles.animated}
              style={{
                transformOrigin: "34px 76px",
                animation: `${styles["pet-chinTap2"]} calc(var(--t)*2.2) ease-in-out infinite`,
              }}
            >
              <path
                d="M34 76l-7-6 8-6"
                fill="none"
                stroke="#2F3742"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="34" cy="76" r="4.6" fill="#2F3742" />
              <circle cx="35" cy="64" r="4" fill="#2F3742" />
            </g>
            <rect x="75" y="72" width="8" height="15" rx="4" fill="#2F3742" />
            <g className={styles.head}>
              <line
                x1="55"
                y1="22"
                x2="55"
                y2="14"
                stroke="#3C4552"
                strokeWidth="2.6"
              />
              <circle
                cx="55"
                cy="12"
                r="3.4"
                className={`${styles.antenna} ${styles.animated}`}
                style={{
                  animation: `${styles["pet-glow"]} calc(var(--t)*2) ease-in-out infinite`,
                }}
              />
              <rect
                x="24"
                y="22"
                width="62"
                height="48"
                rx="7"
                fill="#4A5563"
              />
              <rect
                x="28"
                y="26"
                width="54"
                height="40"
                rx="5"
                fill="#171D26"
              />
              {music && <Headphones {...music} />}
              <g
                stroke="#39E0C8"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".5"
              >
                <line x1="38" y1="33" x2="49" y2="33" />
                <line x1="61" y1="33" x2="72" y2="33" />
              </g>
              <rect
                x="38"
                y="38"
                width="11"
                height="11"
                rx="2"
                fill="#39E0C8"
              />
              <rect
                x="61"
                y="38"
                width="11"
                height="11"
                rx="2"
                fill="#39E0C8"
              />
              <rect
                x="43.5"
                y="39.5"
                width="4"
                height="4.5"
                rx="1"
                fill="#171D26"
              />
              <rect
                x="66.5"
                y="39.5"
                width="4"
                height="4.5"
                rx="1"
                fill="#171D26"
              />
              <rect
                x="52"
                y="57"
                width="6"
                height="2"
                rx="1"
                fill="#39E0C8"
                opacity=".45"
              />
            </g>
          </g>
          <ellipse cx="118" cy="92" rx="26" ry="2.4" fill="rgba(23,29,38,.1)" />
          <g
            className={styles.animated}
            style={{
              transformOrigin: "118px 47px",
              animation: `${styles["pet-unroll"]} calc(var(--t)*5) ease-in-out infinite`,
            }}
          >
            <rect
              x="94"
              y="47"
              width="48"
              height="41"
              fill="#FCFDFE"
              stroke="#C6D0DA"
              strokeWidth="1.3"
            />
            <g stroke="#E7ECF1" strokeWidth="1">
              <line x1="94" y1="61" x2="142" y2="61" />
              <line x1="94" y1="75" x2="142" y2="75" />
              <line x1="110" y1="47" x2="110" y2="88" />
              <line x1="126" y1="47" x2="126" y2="88" />
            </g>
            <path
              d="M100 82q7-10 15-8t9-14"
              fill="none"
              stroke="#39E0C8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="70"
              className={styles.animated}
              style={{
                animation: `${styles["pet-draw2"]} calc(var(--t)*5) ease-in-out infinite`,
              }}
            />
            <circle cx="100" cy="82" r="2.8" fill="#4A5563" />
            <g
              className={styles.animated}
              style={{
                transformOrigin: "124px 60px",
                animation: `${styles["pet-popIn"]} calc(var(--t)*5) ease-out infinite`,
              }}
            >
              <line
                x1="124"
                y1="60"
                x2="124"
                y2="51"
                stroke="#4A5563"
                strokeWidth="1.8"
              />
              <path d="M124 51h9l-2.4 3.4L133 58h-9z" fill="#39E0C8" />
            </g>
          </g>
          <rect x="91" y="43" width="54" height="5" rx="2.5" fill="#8AA0B4" />
          <rect x="91" y="43" width="54" height="1.6" rx=".8" fill="#A8B6C2" />
        </g>
      );
    case "waiting":
      return (
        <g data-look="waiting">
          <ellipse cx="55" cy="99" rx="26" ry="2.8" fill="rgba(70,50,10,.12)" />
          <g
            className={styles.animated}
            style={{
              transformOrigin: "55px 99px",
              animation: `${styles["pet-pulseS"]} calc(var(--t)*1.1) ease-in-out infinite`,
            }}
          >
            <rect x="35" y="72" width="40" height="20" rx="4" fill="#3C4552" />
            <rect
              x="41"
              y="78"
              width="28"
              height="2.2"
              rx="1.1"
              fill="#2A313B"
            />
            <rect x="38" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="60" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="25" y="72" width="8" height="15" rx="4" fill="#2F3742" />
            <g className={styles.head}>
              <line
                x1="55"
                y1="22"
                x2="55"
                y2="14"
                stroke="#3C4552"
                strokeWidth="2.6"
              />
              <circle
                cx="55"
                cy="12"
                r="4"
                className={`${styles.antenna} ${styles.animated}`}
                style={
                  {
                    "--antenna-base": "#FFB020",
                    animation: `${styles["pet-glow"]} calc(var(--t)*1.1) ease-in-out infinite`,
                  } as CSSProperties
                }
              />
              <rect
                x="24"
                y="22"
                width="62"
                height="48"
                rx="7"
                fill="#4A5563"
              />
              <rect
                x="28"
                y="26"
                width="54"
                height="40"
                rx="5"
                fill="#171D26"
              />
              {music && <Headphones {...music} />}
              <g
                stroke="#FFB020"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".55"
              >
                <line x1="37" y1="33" x2="49" y2="31.5" />
                <line x1="73" y1="33" x2="61" y2="31.5" />
              </g>
              <circle cx="44.5" cy="45" r="7" fill="#FFB020" />
              <circle cx="65.5" cy="45" r="7" fill="#FFB020" />
              <circle cx="42" cy="42.5" r="2.2" fill="#171D26" opacity=".35" />
              <circle cx="63" cy="42.5" r="2.2" fill="#171D26" opacity=".35" />
              <ellipse
                cx="55"
                cy="58"
                rx="5"
                ry="3.6"
                fill="#FFB020"
                opacity=".7"
              />
            </g>
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "76px 76px",
              animation: `${styles["pet-knock2"]} calc(var(--t)*2.4) ease-in-out infinite`,
            }}
          >
            <path
              d="M76 76l11-6 9-5"
              fill="none"
              stroke="#2F3742"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="76" cy="76" r="4.6" fill="#2F3742" />
            <circle cx="96" cy="65" r="4.2" fill="#2F3742" />
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "118px 62px",
              animation: `${styles["pet-shake"]} calc(var(--t)*.8) ease-in-out infinite`,
            }}
          >
            <path
              d="M108 52v-6a10 10 0 0 1 20 0v6"
              fill="none"
              stroke="#8A6A28"
              strokeWidth="4.4"
            />
            <rect x="102" y="52" width="32" height="26" rx="3" fill="#FFB020" />
            <rect
              x="102"
              y="52"
              width="32"
              height="26"
              rx="3"
              fill="none"
              stroke="#8A6A28"
              strokeWidth="1.6"
            />
            <circle cx="118" cy="62" r="3.6" fill="#8A6A28" />
            <rect x="116.6" y="63" width="2.8" height="7" fill="#8A6A28" />
          </g>
          <text
            x="118"
            y="26"
            textAnchor="middle"
            fill="#8A6A28"
            className={styles.animated}
            style={{
              font: "700 18px Archivo,sans-serif",
              transformOrigin: "118px 21px",
              animation: `${styles["pet-pulse"]} calc(var(--t)*1.1) ease-in-out infinite`,
            }}
          >
            ?
          </text>
        </g>
      );
    case "resting":
      return (
        <g data-look="resting">
          <ellipse cx="55" cy="99" rx="26" ry="2.8" fill="rgba(23,29,38,.12)" />
          <g
            className={styles.animated}
            style={{
              transformOrigin: "55px 92px",
              animation: `${styles["pet-breathe"]} calc(var(--t)*3.4) ease-in-out infinite`,
            }}
          >
            <rect x="35" y="72" width="40" height="20" rx="4" fill="#3C4552" />
            <rect
              x="41"
              y="78"
              width="28"
              height="2.2"
              rx="1.1"
              fill="#2A313B"
            />
            <g
              className={styles.animated}
              style={{
                transformOrigin: "44px 91px",
                animation: `${styles["pet-swing"]} calc(var(--t)*2.6) ease-in-out infinite`,
              }}
            >
              <rect
                x="38"
                y="91"
                width="12"
                height="5"
                rx="2.5"
                fill="#2A313B"
              />
            </g>
            <g
              className={styles.animated}
              style={{
                transformOrigin: "66px 91px",
                animation: `${styles["pet-swing"]} calc(var(--t)*2.6) ease-in-out .4s infinite`,
              }}
            >
              <rect
                x="60"
                y="91"
                width="12"
                height="5"
                rx="2.5"
                fill="#2A313B"
              />
            </g>
            <rect x="25" y="72" width="8" height="15" rx="4" fill="#2F3742" />
            <g className={styles.head}>
              <line
                x1="55"
                y1="22"
                x2="55"
                y2="14"
                stroke="#3C4552"
                strokeWidth="2.6"
              />
              <circle cx="55" cy="12" r="3.4" className={styles.antenna} />
              <rect
                x="24"
                y="22"
                width="62"
                height="48"
                rx="7"
                fill="#4A5563"
              />
              <rect
                x="28"
                y="26"
                width="54"
                height="40"
                rx="5"
                fill="#171D26"
              />
              {music && <Headphones {...music} />}
              <path
                d="M39 47q5.5-6.5 11 0"
                fill="none"
                stroke="#39E0C8"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M60 47q5.5-6.5 11 0"
                fill="none"
                stroke="#39E0C8"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M45 56q10 8 20 0"
                fill="none"
                stroke="#39E0C8"
                strokeWidth="2.6"
                strokeLinecap="round"
                opacity=".75"
              />
            </g>
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "112px 88px",
              animation: `${styles["pet-sip"]} calc(var(--t)*4.4) ease-in-out infinite`,
            }}
          >
            <ellipse cx="112" cy="88" rx="21" ry="4.2" fill="#DDE4EB" />
            <ellipse cx="112" cy="86.6" rx="21" ry="4.2" fill="#EFF3F7" />
            <path
              d="M124 68q9 1 9 8t-8 8"
              fill="none"
              stroke="#C6D0DA"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            <path
              d="M100 64h24l-3 19q-9 4.5-18 0z"
              fill="#F7F9FB"
              stroke="#C6D0DA"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <ellipse
              cx="112"
              cy="64"
              rx="12"
              ry="3.6"
              fill="#FDFEFF"
              stroke="#C6D0DA"
              strokeWidth="1.4"
            />
            <ellipse cx="112" cy="64.2" rx="9" ry="2.5" fill="#8A5A32" />
            <ellipse
              cx="109"
              cy="63.6"
              rx="3"
              ry="1"
              fill="#A87246"
              opacity=".7"
            />
          </g>
          <g
            fill="none"
            stroke="#B9C4CE"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <path
              d="M106 60q-3-5 0-9"
              className={styles.animated}
              style={{
                transformOrigin: "106px 60px",
                animation: `${styles["pet-steam"]} calc(var(--t)*3) ease-out infinite`,
              }}
            />
            <path
              d="M112 60q3-5 0-10"
              className={styles.animated}
              style={{
                transformOrigin: "112px 60px",
                animation: `${styles["pet-steam"]} calc(var(--t)*3) ease-out .9s infinite`,
              }}
            />
            <path
              d="M118 60q-3-4 0-8"
              className={styles.animated}
              style={{
                transformOrigin: "118px 60px",
                animation: `${styles["pet-steam"]} calc(var(--t)*3) ease-out 1.8s infinite`,
              }}
            />
          </g>
          <g>
            <path
              d="M76 76h11l9-6"
              fill="none"
              stroke="#2F3742"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="76" cy="76" r="4.6" fill="#2F3742" />
            <circle cx="96" cy="70" r="4" fill="#2F3742" />
          </g>
        </g>
      );
    case "sleeping":
      return (
        <g data-look="sleeping">
          <ellipse cx="55" cy="99" rx="26" ry="2.8" fill="rgba(23,29,38,.1)" />
          <rect x="112" y="70" width="34" height="24" rx="2" fill="#C6D0DA" />
          <rect x="116" y="66" width="26" height="5" rx="2" fill="#AEBAC6" />
          <path
            d="M75 86q22 8 37 0"
            fill="none"
            stroke="#8AA0B4"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <g
            className={styles.animated}
            style={{
              transformOrigin: "55px 92px",
              animation: `${styles["pet-breathe"]} calc(var(--t)*5.6) ease-in-out infinite`,
            }}
          >
            <rect x="35" y="72" width="40" height="20" rx="4" fill="#3C4552" />
            <rect
              x="41"
              y="78"
              width="28"
              height="2.2"
              rx="1.1"
              fill="#2A313B"
            />
            <rect x="38" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="60" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="25" y="72" width="8" height="15" rx="4" fill="#2F3742" />
            <rect x="75" y="72" width="8" height="15" rx="4" fill="#2F3742" />
            <g className={styles.head}>
              <line
                x1="55"
                y1="22"
                x2="55"
                y2="16"
                stroke="#3C4552"
                strokeWidth="2.6"
              />
              <circle
                cx="55"
                cy="14"
                r="3.4"
                opacity=".3"
                className={styles.antenna}
              />
              <rect
                x="24"
                y="22"
                width="62"
                height="48"
                rx="7"
                fill="#4A5563"
              />
              <rect
                x="28"
                y="26"
                width="54"
                height="40"
                rx="5"
                fill="#171D26"
              />
              {music && <Headphones {...music} />}
              <line
                x1="39"
                y1="46"
                x2="50"
                y2="46"
                stroke="#39E0C8"
                strokeWidth="3"
                strokeLinecap="round"
                opacity=".45"
              />
              <line
                x1="60"
                y1="46"
                x2="71"
                y2="46"
                stroke="#39E0C8"
                strokeWidth="3"
                strokeLinecap="round"
                opacity=".45"
              />
              <path
                d="M52 57q3 3 6 0"
                fill="none"
                stroke="#39E0C8"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity=".25"
              />
            </g>
          </g>
          <g>
            <rect
              x="94"
              y="24"
              width="26"
              height="13"
              rx="2"
              fill="none"
              stroke="#8AA0B4"
              strokeWidth="1.8"
            />
            <rect x="120.5" y="28" width="3" height="5" rx="1" fill="#8AA0B4" />
            <rect
              x="96"
              y="26"
              width="22"
              height="9"
              fill="#39E0C8"
              className={styles.animated}
              style={{
                transformOrigin: "96px 35px",
                animation: `${styles["pet-fillX"]} calc(var(--t)*6) linear infinite`,
              }}
            />
          </g>
          <text
            x="100"
            y="58"
            textAnchor="middle"
            fill="#6E7C89"
            className={styles.animated}
            style={{
              font: "700 15px Archivo,sans-serif",
              animation: `${styles["pet-zzz"]} calc(var(--t)*3.6) ease-in infinite`,
            }}
          >
            z
          </text>
          <text
            x="100"
            y="58"
            textAnchor="middle"
            fill="#6E7C89"
            className={styles.animated}
            style={{
              font: "700 11px Archivo,sans-serif",
              animation: `${styles["pet-zzz"]} calc(var(--t)*3.6) ease-in 1.3s infinite`,
            }}
          >
            z
          </text>
        </g>
      );
    case "terminal":
      return (
        <g data-look="terminal">
          <clipPath id="amnis-pet-terminal-screen">
            <rect x="92" y="52" width="54" height="34" />
          </clipPath>
          <ellipse cx="55" cy="99" rx="26" ry="2.8" fill="rgba(23,29,38,.12)" />
          <g
            className={styles.animated}
            style={{
              transformOrigin: "55px 99px",
              animation: `${styles["pet-bob"]} calc(var(--t)*2.6) ease-in-out infinite`,
            }}
          >
            <rect x="35" y="72" width="40" height="20" rx="4" fill="#3C4552" />
            <rect
              x="41"
              y="78"
              width="28"
              height="2.2"
              rx="1.1"
              fill="#2A313B"
            />
            <rect x="38" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="60" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="25" y="72" width="8" height="15" rx="4" fill="#2F3742" />
            <g className={styles.head}>
              <line
                x1="55"
                y1="22"
                x2="55"
                y2="14"
                stroke="#3C4552"
                strokeWidth="2.6"
              />
              <circle
                cx="55"
                cy="12"
                r="3.4"
                className={`${styles.antenna} ${styles.animated}`}
                style={{
                  animation: `${styles["pet-glow"]} calc(var(--t)*1.2) ease-in-out infinite`,
                }}
              />
              <rect
                x="24"
                y="22"
                width="62"
                height="48"
                rx="7"
                fill="#4A5563"
              />
              <rect
                x="28"
                y="26"
                width="54"
                height="40"
                rx="5"
                fill="#171D26"
              />
              {music && <Headphones {...music} />}
              <g
                fill="none"
                stroke="#39E0C8"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M40 40l5 5-5 5" />
                <path d="M61 40l5 5-5 5" />
              </g>
              <rect
                x="49"
                y="57"
                width="12"
                height="2.4"
                rx="1.2"
                fill="#39E0C8"
                opacity=".7"
                className={styles.animated}
                style={{
                  animation: `${styles["pet-cursor"]} calc(var(--t)*.8) step-end infinite`,
                }}
              />
            </g>
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "76px 76px",
              animation: `${styles["pet-hitKey"]} calc(var(--t)*4) ease-in-out infinite`,
            }}
          >
            <path
              d="M76 76l11 6 9 4"
              fill="none"
              stroke="#2F3742"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="76" cy="76" r="4.6" fill="#2F3742" />
            <circle cx="96" cy="86" r="4.2" fill="#2F3742" />
          </g>
          <ellipse cx="119" cy="96" rx="30" ry="2.4" fill="rgba(23,29,38,.1)" />
          <rect x="92" y="44" width="54" height="46" rx="2" fill="#0E1319" />
          <rect x="92" y="44" width="54" height="8" rx="2" fill="#2A313B" />
          <rect x="92" y="49" width="54" height="3" fill="#2A313B" />
          <g fill="#5D6A7A">
            <circle cx="97" cy="48" r="1.6" />
            <circle cx="102" cy="48" r="1.6" />
            <circle cx="107" cy="48" r="1.6" />
          </g>
          <g clipPath="url(#amnis-pet-terminal-screen)">
            <text
              x="96"
              y="61"
              fill="#39E0C8"
              style={{ font: "600 6px ui-monospace,Menlo,monospace" }}
            >
              $
            </text>
            <g
              className={styles.animated}
              style={{
                transformOrigin: "101px 61px",
                animation: `${styles["pet-typeW"]} calc(var(--t)*4) steps(8,end) infinite`,
              }}
            >
              <rect x="101" y="56.5" width="30" height="2.2" fill="#DCE4EB" />
            </g>
            <g fill="#8AA0B4">
              <rect
                x="96"
                y="66"
                width="34"
                height="2"
                className={styles.animated}
                style={{
                  animation: `${styles["pet-outLine"]} calc(var(--t)*4) steps(1,end) infinite`,
                }}
              />
              <rect
                x="96"
                y="71"
                width="26"
                height="2"
                className={styles.animated}
                style={{
                  animation: `${styles["pet-outLine2"]} calc(var(--t)*4) steps(1,end) infinite`,
                }}
              />
              <rect
                x="96"
                y="76"
                width="30"
                height="2"
                className={styles.animated}
                style={{
                  animation: `${styles["pet-outLine3"]} calc(var(--t)*4) steps(1,end) infinite`,
                }}
              />
            </g>
            <g
              className={styles.animated}
              style={{
                transformOrigin: "99px 83px",
                animation: `${styles["pet-spinBar"]} calc(var(--t)*.6) steps(4,end) infinite`,
              }}
            >
              <rect x="96.6" y="81.4" width="4.8" height="1.6" fill="#39E0C8" />
            </g>
            <rect
              x="105"
              y="80"
              width="3"
              height="4.4"
              fill="#39E0C8"
              className={styles.animated}
              style={{
                animation: `${styles["pet-cursor"]} .9s step-end infinite`,
              }}
            />
          </g>
          <rect
            x="92"
            y="44"
            width="54"
            height="46"
            rx="2"
            fill="none"
            stroke="#39E0C8"
            strokeOpacity=".14"
          />
          <rect x="88" y="90" width="26" height="6" rx="1.5" fill="#C6D0DA" />
          <rect
            x="103"
            y="91.4"
            width="8"
            height="3.2"
            rx="1"
            fill="#39E0C8"
            className={styles.animated}
            style={{
              animation: `${styles["pet-enterLite"]} calc(var(--t)*4) steps(1,end) infinite`,
            }}
          />
        </g>
      );
    case "subagents":
      return (
        <g data-look="subagents">
          <ellipse cx="55" cy="99" rx="26" ry="2.8" fill="rgba(23,29,38,.12)" />
          <g
            className={styles.animated}
            style={{
              transformOrigin: "55px 99px",
              animation: `${styles["pet-bob"]} calc(var(--t)*2) ease-in-out infinite`,
            }}
          >
            <rect x="35" y="72" width="40" height="20" rx="4" fill="#3C4552" />
            <rect
              x="41"
              y="78"
              width="28"
              height="2.2"
              rx="1.1"
              fill="#2A313B"
            />
            <rect x="38" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="60" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="25" y="72" width="8" height="15" rx="4" fill="#2F3742" />
            <g className={styles.head}>
              <line
                x1="55"
                y1="22"
                x2="55"
                y2="14"
                stroke="#3C4552"
                strokeWidth="2.6"
              />
              <circle
                cx="55"
                cy="12"
                r="3.4"
                className={`${styles.antenna} ${styles.animated}`}
                style={{
                  animation: `${styles["pet-glow"]} calc(var(--t)*1.6) ease-in-out infinite`,
                }}
              />
              <rect
                x="24"
                y="22"
                width="62"
                height="48"
                rx="7"
                fill="#4A5563"
              />
              <rect
                x="28"
                y="26"
                width="54"
                height="40"
                rx="5"
                fill="#171D26"
              />
              {music && <Headphones {...music} />}
              <g
                stroke="#39E0C8"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".5"
              >
                <line x1="38" y1="34" x2="49" y2="35.5" />
                <line x1="72" y1="34" x2="61" y2="35.5" />
              </g>
              <rect
                x="38"
                y="40"
                width="11"
                height="10"
                rx="2"
                fill="#39E0C8"
              />
              <rect
                x="61"
                y="40"
                width="11"
                height="10"
                rx="2"
                fill="#39E0C8"
              />
              <rect
                x="43.5"
                y="42.5"
                width="4.5"
                height="5"
                rx="1"
                fill="#171D26"
              />
              <rect
                x="66.5"
                y="42.5"
                width="4.5"
                height="5"
                rx="1"
                fill="#171D26"
              />
              <path
                d="M49 56.5q6 4.5 12 0"
                fill="none"
                stroke="#39E0C8"
                strokeWidth="2.2"
                strokeLinecap="round"
                opacity=".7"
              />
            </g>
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "76px 76px",
              animation: `${styles["pet-handOff"]} calc(var(--t)*4.5) ease-in-out infinite`,
            }}
          >
            <path
              d="M76 76l12-2 10-2"
              fill="none"
              stroke="#2F3742"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="76" cy="76" r="4.6" fill="#2F3742" />
            <circle cx="98" cy="72" r="4.2" fill="#2F3742" />
          </g>
          <g
            stroke="#8AA0B4"
            strokeWidth="1.4"
            strokeDasharray="3 3"
            fill="none"
          >
            <path
              d="M100 70q10-14 22-22"
              className={styles.animated}
              style={{
                animation: `${styles["pet-link1"]} calc(var(--t)*4.5) linear infinite, ${styles["pet-dashFlow"]} calc(var(--t)*.7) linear infinite`,
              }}
            />
            <path
              d="M100 72q14-2 26 2"
              className={styles.animated}
              style={{
                animation: `${styles["pet-link2"]} calc(var(--t)*4.5) linear infinite, ${styles["pet-dashFlow"]} calc(var(--t)*.7) linear infinite`,
              }}
            />
            <path
              d="M100 74q11 12 21 22"
              className={styles.animated}
              style={{
                animation: `${styles["pet-link3"]} calc(var(--t)*4.5) linear infinite, ${styles["pet-dashFlow"]} calc(var(--t)*.7) linear infinite`,
              }}
            />
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "130px 44px",
              animation: `${styles["pet-mini1"]} calc(var(--t)*4.5) cubic-bezier(.3,1.3,.6,1) infinite`,
            }}
          >
            <rect x="120" y="38" width="20" height="15" rx="2" fill="#5D6A7A" />
            <rect x="123" y="41" width="14" height="9" rx="1" fill="#171D26" />
            <rect x="125" y="44" width="3.4" height="3.4" fill="#39E0C8" />
            <rect x="131.6" y="44" width="3.4" height="3.4" fill="#39E0C8" />
            <line
              x1="130"
              y1="38"
              x2="130"
              y2="33"
              stroke="#5D6A7A"
              strokeWidth="1.6"
            />
            <circle
              cx="130"
              cy="32"
              r="2"
              fill="#39E0C8"
              className={styles.animated}
              style={{
                animation: `${styles["pet-glow"]} calc(var(--t)*.9) ease-in-out infinite`,
              }}
            />
            <rect
              x="124"
              y="53"
              width="12"
              height="6"
              rx="1.5"
              fill="#4A5563"
            />
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "132px 72px",
              animation: `${styles["pet-mini2"]} calc(var(--t)*4.5) cubic-bezier(.3,1.3,.6,1) infinite`,
            }}
          >
            <rect x="122" y="66" width="20" height="15" rx="2" fill="#5D6A7A" />
            <rect x="125" y="69" width="14" height="9" rx="1" fill="#171D26" />
            <rect x="127" y="72" width="3.4" height="3.4" fill="#39E0C8" />
            <rect x="133.6" y="72" width="3.4" height="3.4" fill="#39E0C8" />
            <line
              x1="132"
              y1="66"
              x2="132"
              y2="61"
              stroke="#5D6A7A"
              strokeWidth="1.6"
            />
            <circle
              cx="132"
              cy="60"
              r="2"
              fill="#39E0C8"
              className={styles.animated}
              style={{
                animation: `${styles["pet-glow"]} calc(var(--t)*.9) ease-in-out .3s infinite`,
              }}
            />
            <rect
              x="126"
              y="81"
              width="12"
              height="6"
              rx="1.5"
              fill="#4A5563"
            />
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "122px 98px",
              animation: `${styles["pet-mini3"]} calc(var(--t)*4.5) cubic-bezier(.3,1.3,.6,1) infinite`,
            }}
          >
            <rect x="112" y="92" width="20" height="15" rx="2" fill="#5D6A7A" />
            <rect x="115" y="95" width="14" height="9" rx="1" fill="#171D26" />
            <rect x="117" y="98" width="3.4" height="3.4" fill="#39E0C8" />
            <rect x="123.6" y="98" width="3.4" height="3.4" fill="#39E0C8" />
            <line
              x1="122"
              y1="92"
              x2="122"
              y2="87"
              stroke="#5D6A7A"
              strokeWidth="1.6"
            />
            <circle
              cx="122"
              cy="86"
              r="2"
              fill="#39E0C8"
              className={styles.animated}
              style={{
                animation: `${styles["pet-glow"]} calc(var(--t)*.9) ease-in-out .6s infinite`,
              }}
            />
          </g>
        </g>
      );
    case "committing":
      return (
        <g data-look="committing">
          <ellipse cx="55" cy="99" rx="26" ry="2.8" fill="rgba(23,29,38,.12)" />
          <g
            className={styles.animated}
            style={{
              transformOrigin: "55px 99px",
              animation: `${styles["pet-bob"]} calc(var(--t)*2.2) ease-in-out infinite`,
            }}
          >
            <rect x="35" y="72" width="40" height="20" rx="4" fill="#3C4552" />
            <rect
              x="41"
              y="78"
              width="28"
              height="2.2"
              rx="1.1"
              fill="#2A313B"
            />
            <rect x="38" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="60" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="25" y="72" width="8" height="15" rx="4" fill="#2F3742" />
            <g className={styles.head}>
              <line
                x1="55"
                y1="22"
                x2="55"
                y2="14"
                stroke="#3C4552"
                strokeWidth="2.6"
              />
              <circle
                cx="55"
                cy="12"
                r="3.4"
                className={styles.antenna}
                fill="#39E0C8"
              />
              <rect
                x="24"
                y="22"
                width="62"
                height="48"
                rx="7"
                fill="#4A5563"
              />
              <rect
                x="28"
                y="26"
                width="54"
                height="40"
                rx="5"
                fill="#171D26"
              />
              {music && <Headphones {...music} />}
              <g
                stroke="#39E0C8"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".55"
              >
                <line x1="38" y1="35" x2="49" y2="36.5" />
                <line x1="72" y1="35" x2="61" y2="36.5" />
              </g>
              <rect
                x="39"
                y="41"
                width="10"
                height="9"
                rx="1.5"
                fill="#39E0C8"
              />
              <rect
                x="61"
                y="41"
                width="10"
                height="9"
                rx="1.5"
                fill="#39E0C8"
              />
              <rect
                x="44"
                y="43"
                width="4"
                height="4.6"
                rx="1"
                fill="#171D26"
              />
              <rect
                x="66"
                y="43"
                width="4"
                height="4.6"
                rx="1"
                fill="#171D26"
              />
              <rect
                x="50"
                y="56.5"
                width="10"
                height="2.2"
                rx="1.1"
                fill="#39E0C8"
                opacity=".55"
              />
            </g>
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "76px 76px",
              animation: `${styles["pet-stampArm"]} calc(var(--t)*3.4) cubic-bezier(.3,0,.4,1) infinite`,
            }}
          >
            <path
              d="M76 76l11-4 9-3"
              fill="none"
              stroke="#2F3742"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="76" cy="76" r="4.6" fill="#2F3742" />
            <rect x="90" y="60" width="14" height="9" rx="1.5" fill="#2F3742" />
            <rect x="94" y="55" width="6" height="6" rx="1.5" fill="#2F3742" />
          </g>
          <ellipse cx="120" cy="94" rx="27" ry="2.4" fill="rgba(23,29,38,.1)" />
          <rect x="96" y="72" width="48" height="20" fill="#B98A4E" />
          <rect
            x="96"
            y="72"
            width="48"
            height="20"
            fill="none"
            stroke="#8A6432"
            strokeWidth="1.2"
          />
          <rect x="117.6" y="72" width="4.8" height="20" fill="#A8783E" />
          <g
            className={styles.animated}
            style={{
              transformOrigin: "96px 72px",
              animation: `${styles["pet-flapL"]} calc(var(--t)*3.4) cubic-bezier(.4,0,.5,1) infinite`,
            }}
          >
            <rect
              x="96"
              y="66"
              width="24"
              height="6"
              fill="#CFA36A"
              stroke="#8A6432"
              strokeWidth="1"
            />
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "144px 72px",
              animation: `${styles["pet-flapR"]} calc(var(--t)*3.4) cubic-bezier(.4,0,.5,1) infinite`,
            }}
          >
            <rect
              x="120"
              y="66"
              width="24"
              height="6"
              fill="#CFA36A"
              stroke="#8A6432"
              strokeWidth="1"
            />
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "120px 76px",
              animation: `${styles["pet-stampMark"]} calc(var(--t)*3.4) ease-out infinite`,
            }}
          >
            <rect
              x="106"
              y="76"
              width="28"
              height="11"
              fill="none"
              stroke="#EC3013"
              strokeWidth="1.6"
            />
          </g>
        </g>
      );
    case "pushing":
      return (
        <g data-look="pushing">
          <ellipse cx="55" cy="99" rx="26" ry="2.8" fill="rgba(23,29,38,.12)" />
          <g
            className={styles.animated}
            style={{
              transformOrigin: "55px 99px",
              animation: `${styles["pet-bob"]} calc(var(--t)*1.5) ease-in-out infinite`,
            }}
          >
            <rect x="35" y="72" width="40" height="20" rx="4" fill="#3C4552" />
            <rect
              x="41"
              y="78"
              width="28"
              height="2.2"
              rx="1.1"
              fill="#2A313B"
            />
            <rect x="38" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="60" y="91" width="12" height="5" rx="2.5" fill="#2A313B" />
            <rect x="25" y="72" width="8" height="15" rx="4" fill="#2F3742" />
            <g className={styles.head}>
              <line
                x1="55"
                y1="22"
                x2="55"
                y2="14"
                stroke="#3C4552"
                strokeWidth="2.6"
              />
              <circle
                cx="55"
                cy="12"
                r="3.4"
                className={styles.antenna}
                fill="#39E0C8"
              />
              <rect
                x="24"
                y="22"
                width="62"
                height="48"
                rx="7"
                fill="#4A5563"
              />
              <rect
                x="28"
                y="26"
                width="54"
                height="40"
                rx="5"
                fill="#171D26"
              />
              {music && <Headphones {...music} />}
              <g
                className={styles.animated}
                style={{
                  transformOrigin: "55px 45px",
                  animation: `${styles["pet-blink"]} calc(var(--t)*5) ease-in-out infinite`,
                }}
              >
                <path
                  d="M38 47q6-9 12 0"
                  fill="none"
                  stroke="#39E0C8"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <path
                  d="M60 47q6-9 12 0"
                  fill="none"
                  stroke="#39E0C8"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
              </g>
              <path
                d="M47 56q8 6 16 0"
                fill="none"
                stroke="#39E0C8"
                strokeWidth="2.4"
                strokeLinecap="round"
                opacity=".75"
              />
            </g>
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "76px 76px",
              animation: `${styles["pet-pushArm"]} calc(var(--t)*4) ease-in-out infinite`,
            }}
          >
            <path
              d="M76 76l12 1 9 1"
              fill="none"
              stroke="#2F3742"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="76" cy="76" r="4.6" fill="#2F3742" />
            <circle cx="97" cy="77" r="4.2" fill="#2F3742" />
          </g>
          <rect x="86" y="86" width="60" height="7" fill="#5D6A7A" />
          <g
            className={styles.animated}
            fill="#8AA0B4"
            style={{
              animation: `${styles["pet-beltRun"]} calc(var(--t)*.5) linear infinite`,
            }}
          >
            <rect x="88" y="88" width="4" height="3" />
            <rect x="98" y="88" width="4" height="3" />
            <rect x="108" y="88" width="4" height="3" />
            <rect x="118" y="88" width="4" height="3" />
            <rect x="128" y="88" width="4" height="3" />
            <rect x="138" y="88" width="4" height="3" />
          </g>
          <g
            className={styles.animated}
            style={{
              animation: `${styles["pet-boxGo"]} calc(var(--t)*4) cubic-bezier(.4,0,.7,1) infinite`,
            }}
          >
            <rect x="90" y="66" width="22" height="20" fill="#B98A4E" />
            <rect
              x="90"
              y="66"
              width="22"
              height="20"
              fill="none"
              stroke="#8A6432"
              strokeWidth="1.2"
            />
            <rect x="98.6" y="66" width="4.8" height="20" fill="#A8783E" />
            <rect x="90" y="72" width="22" height="3" fill="#CFA36A" />
            <rect
              x="93"
              y="77"
              width="16"
              height="7"
              fill="none"
              stroke="#EC3013"
              strokeWidth="1"
            />
            <text
              x="101"
              y="82.4"
              textAnchor="middle"
              fill="#EC3013"
              style={{ font: "700 4px ui-monospace,Menlo,monospace" }}
            >
              {commitHash ?? "······"}
            </text>
          </g>
          <g
            className={styles.animated}
            style={{
              animation: `${styles["pet-cloudPulse"]} calc(var(--t)*4) ease-in-out infinite`,
            }}
          >
            <path
              d="M120 42q0-9 9-9 4-7 11-4 8 0 8 8 4 1 4 5 0 5-6 5h-20q-6 0-6-5z"
              fill="#C6D0DA"
            />
            <path
              d="M133 62v-13"
              fill="none"
              stroke="#39E0C8"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeDasharray="4 3"
              className={styles.animated}
              style={{
                animation: `${styles["pet-dashUp"]} calc(var(--t)*.6) linear infinite`,
              }}
            />
            <path
              d="M129 53l4-5 4 5"
              fill="none"
              stroke="#39E0C8"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "133px 38px",
              animation: `${styles["pet-okPop"]} calc(var(--t)*4) ease-out infinite`,
            }}
          >
            <circle cx="133" cy="38" r="7" fill="#1FB98C" />
            <path
              d="M129.6 38l2.6 2.8 4.4-5.2"
              fill="none"
              stroke="#fff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
      );
    case "limited": {
      const minutesLeft = resetsAt
        ? Math.max(
            0,
            Math.round((new Date(resetsAt).getTime() - Date.now()) / 60_000),
          )
        : null;
      const countdown =
        minutesLeft === null
          ? ""
          : `${Math.floor(minutesLeft / 60)}h ${String(minutesLeft % 60).padStart(2, "0")}m`;
      return (
        <g data-look="limited">
          <ellipse cx="55" cy="99" rx="26" ry="2.8" fill="rgba(90,20,10,.12)" />
          <g
            className={styles.animated}
            style={{
              transformOrigin: "55px 92px",
              animation: `${styles["pet-breathe"]} calc(var(--t)*5) ease-in-out infinite`,
            }}
          >
            <rect x="35" y="72" width="40" height="20" rx="4" fill="#3C4552" />
            <rect
              x="41"
              y="78"
              width="28"
              height="2.2"
              rx="1.1"
              fill="#2A313B"
            />
            <rect x="36" y="92" width="14" height="5" rx="2.5" fill="#2A313B" />
            <rect x="60" y="92" width="14" height="5" rx="2.5" fill="#2A313B" />
            <rect x="25" y="72" width="8" height="15" rx="4" fill="#2F3742" />
            <rect x="75" y="72" width="8" height="15" rx="4" fill="#2F3742" />
            <g className={styles.head}>
              <line
                x1="55"
                y1="22"
                x2="55"
                y2="15"
                stroke="#3C4552"
                strokeWidth="2.6"
              />
              <circle
                cx="55"
                cy="13"
                r="3.6"
                className={`${styles.antenna} ${styles.animated}`}
                style={
                  {
                    "--antenna-base": "#EC3013",
                    animation: `${styles["pet-glow"]} calc(var(--t)*2.4) ease-in-out infinite`,
                  } as CSSProperties
                }
              />
              <rect
                x="24"
                y="22"
                width="62"
                height="48"
                rx="7"
                fill="#4A5563"
              />
              <rect
                x="28"
                y="26"
                width="54"
                height="40"
                rx="5"
                fill="#171D26"
              />
              {music && <Headphones {...music} />}
              <g
                stroke="#EC3013"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".5"
              >
                <line x1="38" y1="36" x2="49" y2="33.5" />
                <line x1="72" y1="36" x2="61" y2="33.5" />
              </g>
              <line
                x1="38"
                y1="45"
                x2="49"
                y2="45"
                stroke="#EC3013"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
              <line
                x1="61"
                y1="45"
                x2="72"
                y2="45"
                stroke="#EC3013"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
              <path
                d="M49 58q6-4.5 12 0"
                fill="none"
                stroke="#EC3013"
                strokeWidth="2.2"
                strokeLinecap="round"
                opacity=".7"
              />
            </g>
          </g>
          <rect x="88" y="30" width="58" height="62" fill="#E4D9D6" />
          <rect x="88" y="30" width="58" height="6" fill="#B3A7A3" />
          <g
            className={styles.animated}
            style={{
              transformOrigin: "117px 36px",
              animation: `${styles["pet-shutter"]} calc(var(--t)*6) cubic-bezier(.4,0,.6,1) infinite`,
            }}
          >
            <rect x="88" y="36" width="58" height="46" fill="#C4B8B4" />
            <g stroke="#AA9E99" strokeWidth="1.2">
              <line x1="88" y1="45" x2="146" y2="45" />
              <line x1="88" y1="54" x2="146" y2="54" />
              <line x1="88" y1="63" x2="146" y2="63" />
              <line x1="88" y1="72" x2="146" y2="72" />
            </g>
            <rect x="88" y="78" width="58" height="4" fill="#8E827E" />
          </g>
          <g
            className={styles.animated}
            style={{
              transformOrigin: "117px 56px",
              animation: `${styles["pet-signSwing"]} calc(var(--t)*4) ease-in-out infinite`,
            }}
          >
            <line
              x1="117"
              y1="46"
              x2="117"
              y2="56"
              stroke="#8E827E"
              strokeWidth="1.4"
            />
            <rect x="97" y="56" width="40" height="17" fill="#EC3013" />
            <text
              x="117"
              y="63.5"
              textAnchor="middle"
              fill="#fff"
              style={{
                font: "700 6.5px Archivo,sans-serif",
                letterSpacing: ".08em",
              }}
            >
              LIMITE
            </text>
            {countdown && (
              <text
                x="117"
                y="70.5"
                textAnchor="middle"
                fill="#fff"
                style={{ font: "600 5.5px ui-monospace,Menlo,monospace" }}
              >
                {countdown}
              </text>
            )}
          </g>
          <g
            fill="none"
            stroke="#C4342A"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity=".85"
          >
            <circle cx="103" cy="20" r="7" />
            <line x1="103" y1="16" x2="103" y2="20.5" />
            <line x1="103" y1="20.5" x2="106" y2="22.5" />
          </g>
        </g>
      );
    }
  }
}

/**
 * "Sin conexión" no es un `PetState` — es el eje de conexión de
 * `useAmnisStream.ts` (`ConnectionStatus`), independiente de la fatiga
 * y de cualquier snapshot del daemon (que, por definición, no llega
 * mientras esto se muestra). Por eso fija `--pet-fatigue` a 0 en vez
 * de heredar el último valor conocido: la tele estática de BIT no
 * tiene nada que ver con el cansancio.
 */
export function PetOffline() {
  const style = { "--pet-fatigue": 0 } as CSSProperties;

  return (
    <svg
      className={styles.pet}
      viewBox="0 0 150 110"
      width="100%"
      height="100%"
      role="img"
      data-testid="pet"
      style={style}
    >
      <title>Sin conexión</title>
      <g data-look="offline">
        <ellipse cx="55" cy="99" rx="26" ry="2.8" fill="rgba(23,29,38,.08)" />
        <rect x="112" y="70" width="34" height="24" rx="2" fill="#CFD5DB" />
        <path
          d="M75 86q14 10 24 2"
          fill="none"
          stroke="#A9B2BB"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="100" cy="87" r="3" fill="#A9B2BB" />
        <rect x="35" y="72" width="40" height="20" rx="4" fill="#4A5158" />
        <rect x="38" y="91" width="12" height="5" rx="2.5" fill="#3A4046" />
        <rect x="60" y="91" width="12" height="5" rx="2.5" fill="#3A4046" />
        <rect x="25" y="72" width="8" height="15" rx="4" fill="#3A4046" />
        <rect x="75" y="72" width="8" height="15" rx="4" fill="#3A4046" />
        <line
          x1="55"
          y1="22"
          x2="55"
          y2="14"
          stroke="#4A5158"
          strokeWidth="2.6"
        />
        <circle cx="55" cy="12" r="3.4" fill="#9AA1A8" />
        <rect x="24" y="22" width="62" height="48" rx="7" fill="#5A6168" />
        <rect x="28" y="26" width="54" height="40" rx="5" fill="#171D26" />
        <g
          fill="#8B9298"
          className={styles.animated}
          style={{
            animation: `${styles["pet-static"]} calc(var(--t)*.6) steps(2) infinite`,
          }}
        >
          <rect x="30" y="30" width="50" height="2" />
          <rect x="30" y="36" width="50" height="3" />
          <rect x="30" y="44" width="50" height="2" />
          <rect x="30" y="52" width="50" height="4" />
          <rect x="30" y="60" width="50" height="2" />
        </g>
        <g
          stroke="#8B9298"
          strokeWidth="2.6"
          strokeLinecap="round"
          className={styles.animated}
          style={{
            animation: `${styles["pet-flicker"]} calc(var(--t)*2) steps(1,end) infinite`,
          }}
        >
          <line x1="41" y1="42" x2="49" y2="50" />
          <line x1="49" y1="42" x2="41" y2="50" />
          <line x1="61" y1="42" x2="69" y2="50" />
          <line x1="69" y1="42" x2="61" y2="50" />
        </g>
      </g>
    </svg>
  );
}

/**
 * `<Pet>` recibe `{state, level, fatigue}` y no sabe nada de sprites
 * (docs/DESIGN.md §4). SVG/CSS procedural, sin assets externos.
 * `viewBox` + `100%` — nunca `width`/`height` fijos — es lo que permite
 * al mismo componente servir de icono y de viewport completo
 * (docs/STACK.md §2), y no lleva fondo, marco ni tamaño propio: eso
 * vive en las envolturas de routes/. La fatiga cambia cuánto y a qué
 * ritmo se mueve la mascota, nunca su forma ni su color: el tempo (`--t`),
 * la luz de la antena y, con música, la amplitud (`--amp`), vía custom
 * properties resueltas en Pet.module.css.
 */
export function Pet({
  state,
  level,
  fatigue,
  resetsAt = null,
  commitHash = null,
  listening = null,
  musicPrefs: musicPrefsProp,
}: PetProps) {
  const musicPrefs: MusicPrefs = { ...DEFAULT_MUSIC_PREFS, ...musicPrefsProp };
  const style = {
    "--pet-fatigue": fatigueLevel(fatigue),
  } as CSSProperties;
  // `waiting` y `limited` piden atención (un permiso pendiente, el límite
  // alcanzado): nada de la capa encima, y no se puede configurar (#61).
  const allowed =
    musicPrefs.enabled && state !== "waiting" && state !== "limited";
  const { shown, visible } = useLayerPresence(
    allowed ? listening : null,
    allowed,
  );
  const music = shown
    ? { vibe: shown.vibe, color: layerColor(shown.vibe, musicPrefs.color) }
    : undefined;
  if (shown) {
    // La vibe pone el estilo, el BPM la velocidad y la fatiga la amplitud:
    // cada entrada controla una cosa distinta y no se pisan (#62).
    Object.assign(style, {
      "--beat": `${beatSeconds(shown.bpm)}s`,
      "--amp": amplitude(fatigueLevel(fatigue), musicPrefs.damping),
      "--mx-color": music?.color,
    });
  }

  return (
    <svg
      className={styles.pet}
      viewBox="0 0 150 110"
      width="100%"
      height="100%"
      role="img"
      data-testid="pet"
      data-state={state}
      data-level={level}
      data-vibe={shown?.vibe}
      data-motion={shown ? musicPrefs.motion : undefined}
      data-fallback={shown ? musicPrefs.fallback : undefined}
      style={style}
    >
      <title>{STATE_TITLE[state]}</title>
      <Scene
        state={state}
        resetsAt={resetsAt}
        commitHash={commitHash}
        music={music && { ...music, visible }}
      />
      {shown &&
        !(shown.vibe === "neutral" && musicPrefs.fallback === "quiet") && (
          <MusicFx visible={visible} />
        )}
    </svg>
  );
}
