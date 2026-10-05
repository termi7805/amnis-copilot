import type { SkinAnimation } from "./skinAnimation.ts";

/**
 * Catálogo de serie, en el mismo formato que una skin usaría en su manifest.
 * Solo entra lo que funciona con cualquier pivote; las escenas a medida de BIT
 * se quedan en `Pet.module.css`.
 */
export const SERIES_ANIMATIONS: Record<string, SkinAnimation> = {
  // Cuerpo
  bob: {
    beats: 1,
    keyframes: [
      { at: 0, y: 0 },
      { at: 50, y: -2.5 },
      { at: 100, y: 0 },
    ],
  },
  hop: {
    beats: 1.6,
    keyframes: [
      { at: 0, y: 0 },
      { at: 22, y: -4 },
      { at: 44, y: 0 },
      { at: 66, y: -2 },
      { at: 100, y: 0 },
    ],
  },
  breathe: {
    beats: 3.4,
    keyframes: [
      { at: 0, scale: 1 },
      { at: 50, scale: [1.02, 1.035] },
      { at: 100, scale: 1 },
    ],
  },
  blink: {
    beats: 4.5,
    keyframes: [
      { at: 0, scale: 1 },
      { at: 88, scale: 1 },
      { at: 93, scale: [1, 0.06] },
      { at: 100, scale: 1 },
    ],
  },
  tap: {
    beats: 0.5,
    keyframes: [
      { at: 0, rotate: 0 },
      { at: 50, rotate: 8 },
      { at: 100, rotate: 0 },
    ],
  },
  nod: {
    beats: 2.2,
    keyframes: [
      { at: 0, rotate: -5 },
      { at: 50, rotate: 2 },
      { at: 100, rotate: -5 },
    ],
  },
  swing: {
    beats: 2.6,
    keyframes: [
      { at: 0, rotate: -8 },
      { at: 50, rotate: 8 },
      { at: 100, rotate: -8 },
    ],
  },
  shake: {
    beats: 0.8,
    keyframes: [
      { at: 0, rotate: 0 },
      { at: 25, rotate: -5 },
      { at: 75, rotate: 5 },
      { at: 100, rotate: 0 },
    ],
  },
  knock: {
    beats: 2.4,
    keyframes: [
      { at: 0, rotate: 0 },
      { at: 55, rotate: 0 },
      { at: 66, rotate: -13 },
      { at: 76, rotate: -2 },
      { at: 88, rotate: -11 },
      { at: 100, rotate: 0 },
    ],
  },
  sip: {
    beats: 4.4,
    keyframes: [
      { at: 0, rotate: 0 },
      { at: 44, rotate: -16 },
      { at: 56, rotate: -16 },
      { at: 100, rotate: 0 },
    ],
  },
  spin: {
    beats: 2,
    easing: "linear",
    keyframes: [
      { at: 0, rotate: 0 },
      { at: 100, rotate: 360 },
    ],
  },

  // Objetos
  scroll: {
    beats: 2.4,
    steps: 4,
    keyframes: [
      { at: 0, y: 0 },
      { at: 100, y: -24 },
    ],
  },
  cursor: {
    beats: 1,
    steps: 1,
    keyframes: [
      { at: 0, opacity: 1 },
      { at: 50, opacity: 0 },
      { at: 100, opacity: 0 },
    ],
  },
  pulse: {
    beats: 0.5,
    keyframes: [
      { at: 0, opacity: 0.12 },
      { at: 50, opacity: 1 },
      { at: 100, opacity: 0.12 },
    ],
  },
  "pulse-2": {
    beats: 0.5,
    delay: 0.12,
    keyframes: [
      { at: 0, opacity: 0.12 },
      { at: 50, opacity: 1 },
      { at: 100, opacity: 0.12 },
    ],
  },
  "pulse-3": {
    beats: 0.5,
    delay: 0.25,
    keyframes: [
      { at: 0, opacity: 0.12 },
      { at: 50, opacity: 1 },
      { at: 100, opacity: 0.12 },
    ],
  },
  "pulse-4": {
    beats: 0.5,
    delay: 0.37,
    keyframes: [
      { at: 0, opacity: 0.12 },
      { at: 50, opacity: 1 },
      { at: 100, opacity: 0.12 },
    ],
  },
  glow: {
    beats: 2,
    keyframes: [
      { at: 0, opacity: 0.35 },
      { at: 50, opacity: 1 },
      { at: 100, opacity: 0.35 },
    ],
  },
  wander: {
    beats: 4.4,
    keyframes: [
      { at: 0, x: -13, y: -7 },
      { at: 42, x: 13, y: -7 },
      { at: 50, x: -13, y: 5 },
      { at: 92, x: 13, y: 5 },
      { at: 100, x: -13, y: -7 },
    ],
  },
  drift: {
    beats: 2.6,
    keyframes: [
      { at: 0, x: 0, y: 1 },
      { at: 50, x: 2, y: -3 },
      { at: 100, x: 0, y: 1 },
    ],
  },
  pop: {
    beats: 3.4,
    easing: "ease-out",
    keyframes: [
      { at: 0, scale: 0, opacity: 0 },
      { at: 12, scale: 0, opacity: 0 },
      { at: 26, scale: 1.25, opacity: 1 },
      { at: 34, scale: 1, opacity: 1 },
      { at: 100, scale: 1, opacity: 1 },
    ],
  },
  steam: {
    beats: 3,
    easing: "ease-out",
    keyframes: [
      { at: 0, y: 5, scale: [0.75, 1], opacity: 0 },
      { at: 28, y: -1, scale: [0.92, 1], opacity: 0.85 },
      { at: 100, y: -16, scale: [1.35, 1], opacity: 0 },
    ],
  },
  zzz: {
    beats: 3,
    easing: "ease-out",
    keyframes: [
      { at: 0, x: 0, y: 0, scale: 0.7, opacity: 0 },
      { at: 25, x: 2, y: -4, scale: 0.81, opacity: 1 },
      { at: 100, x: 8, y: -16, scale: 1.15, opacity: 0 },
    ],
  },
};
