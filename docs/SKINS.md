# Skins de la mascota

Una skin sustituye lo que se dibuja por estado; `<Pet>` sigue recibiendo `{state, level, fatigue}`.
Este documento recoge el formato de las **animaciones**, que comparten las de serie y las que una
skin declare en su manifest. Un solo motor: el catálogo de serie está escrito en este mismo formato
y sirve de ejemplo para copiar (`apps/web/src/lib/Pet/skinAnimations.ts`).

## Una animación

```json
{
  "beats": 2,
  "easing": "ease-in-out",
  "delay": 0,
  "keyframes": [
    { "at": 0,   "rotate": 0 },
    { "at": 50,  "rotate": 30, "x": 4 },
    { "at": 100, "rotate": 0 }
  ]
}
```

| Campo | Qué es | Rango |
|---|---|---|
| `beats` | Duración, en múltiplos de `--t` (el tempo que la fatiga ralentiza) | > 0 y ≤ 32 |
| `keyframes` | Fotogramas clave, de menor a mayor `at` | 1–32 |
| `easing` | Curva: `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out` (por defecto) | lista cerrada |
| `steps` | Saltos discretos en N pasos (código que se desplaza, cursor). Excluye `easing` | entero 1–64 |
| `delay` | Retardo en beats, para encadenar piezas | ≥ 0 y < `beats` |

Cada fotograma: `at` (0–100, **estrictamente creciente**) y, opcionales, `x`, `y` (±150, px del
viewBox 150×110), `rotate` (±720°), `scale` (0–4; un número, o `[x, y]`), `opacity` (0–1).

- **La duración va en beats, no en segundos**: cualquier animación se ralentiza con la fatiga
  (×2.6 de fresca a agotada) sin que el autor haga nada.
- **El pivote** (`transform-origin`) lo pone la capa que usa la animación, en coordenadas del
  viewBox; la animación no sabe de él y funciona con cualquiera.
- Si algún fotograma usa `x`, `y`, `rotate` o `scale`, los que omitan alguno vuelven a la identidad
  (0, 0, 0°, 1). `opacity` omitida se interpola entre los fotogramas vecinos.
- Con `prefers-reduced-motion` la animación se apaga.

## Qué garantiza el generador

`animationCss(name, anim)` produce el CSS solo a partir de números validados y de la lista cerrada
de curvas. Nunca copia un texto de un manifest a una regla: un valor no numérico (`"1deg}body{…"`,
`NaN`, `Infinity`), una curva fuera de la lista, un campo desconocido o un nombre que no cumpla
`^[a-z][a-z0-9-]{0,31}$` se rechaza con un error que nombra el campo. `@keyframes` y clase llevan el
prefijo `amnis-anim-`, así que una animación de skin no pisa a una de BIT.

## Catálogo de serie

Cada entrada es el JSON completo en `SERIES_ANIMATIONS`; aquí, qué hace y para qué sirve.

### Cuerpo

| Nombre | Movimiento | Beats |
|---|---|---|
| `bob` | sube y baja 2.5 px | 1 |
| `hop` | dos saltitos, uno mayor | 1.6 |
| `breathe` | respira: escala 1 → 1.02×1.035 | 3.4 |
| `blink` | parpadeo (aplasta en Y) cada cierto tiempo | 4.5 |
| `tap` | golpecito: gira 8° y vuelve | 0.5 |
| `nod` | cabeceo −5° ↔ 2° | 2.2 |
| `swing` | péndulo ±8° | 2.6 |
| `shake` | sacudida ±5° | 0.8 |
| `knock` | tres golpes de puerta tras una pausa | 2.4 |
| `sip` | inclina −16° y vuelve (beber) | 4.4 |
| `spin` | vuelta completa, lineal | 2 |

### Objetos

| Nombre | Movimiento | Beats |
|---|---|---|
| `scroll` | 24 px hacia arriba a saltos (`steps: 4`): el código que se desplaza | 2.4 |
| `cursor` | parpadeo encendido/apagado (`steps: 1`) | 1 |
| `pulse`, `pulse-2`, `pulse-3`, `pulse-4` | opacidad 0.12 ↔ 1; cada una con más `delay`: teclas que se encienden en cadena | 0.5 |
| `glow` | opacidad 0.35 ↔ 1 | 2 |
| `wander` | recorre una zona de 26×12 px en zigzag: la lupa sobre la página | 4.4 |
| `drift` | deriva suave | 2.6 |
| `pop` | aparece escalando con rebote y se queda | 3.4 |
| `steam` | sube 21 px, se ensancha y se desvanece | 3 |
| `zzz` | sube en diagonal creciendo y se desvanece | 3 |

Las animaciones hechas a medida de una escena de BIT (pivotes inline, px fijos, trazos) no entran
en el catálogo: se quedan en `Pet.module.css`.

El banco de pruebas de desarrollo (`/lab`, `PetLab`) muestra todo el catálogo y una animación a
mano, con el selector de fatiga.
