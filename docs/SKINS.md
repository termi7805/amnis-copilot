# Skins de la mascota

Una skin sustituye lo que se dibuja por estado; `<Pet>` sigue recibiendo `{state, level, fatigue}`.
Una skin es una carpeta con imágenes y un `skin.json` (el **manifest**); nunca lleva código. Este
documento recoge el formato del manifest y el de las **animaciones**, que comparten las de serie y
las que una skin declare. Un solo motor: el catálogo de serie está escrito en este mismo formato y
sirve de ejemplo para copiar (`packages/shared/src/seriesAnimations.ts`).

## El manifest (`skin.json`)

El validador (`validateSkinManifest`, en `packages/shared/src/skin.ts`) es la fuente de verdad: cada
error nombra el estado, la capa y el campo (`states.coding.layers[1].anim: …`). Es **tolerante**
donde no cuesta (un estado que no declaras se pinta como BIT; un estado, campo, rol o dato de texto
desconocido se ignora con un aviso, porque puede ser de una versión más nueva de Amnis) y
**estricto** donde un fallo sería silencioso o peligroso (una animación que no existe, una ruta que
sale de la carpeta, un color que no es hex, dos capas `head`).

### Ejemplo mínimo

Solo `coding`; el resto de estados se ven como BIT.

```json
{
  "states": {
    "coding": { "layers": [{ "src": "coding/body.png" }] }
  }
}
```

### Ejemplo completo

```json
{
  "name": "Robi",
  "size": [300, 220],
  "animations": {
    "wiggle": {
      "beats": 1.2,
      "keyframes": [
        { "at": 0, "rotate": -4 },
        { "at": 50, "rotate": 4 },
        { "at": 100, "rotate": -4 }
      ]
    }
  },
  "states": {
    "coding": {
      "layers": [
        { "src": "body.png", "anim": "breathe", "pivot": [75, 100] },
        { "src": "head.png", "role": "head", "anim": "nod", "pivot": [75, 60] },
        { "src": "code.png", "clip": [40, 50, 70, 40], "anim": "scroll" }
      ]
    },
    "resting": {
      "layers": [
        { "src": "body.png" },
        { "src": "zzz.png", "frames": 4, "beats": 3, "anim": "wiggle" }
      ]
    },
    "committing": {
      "layers": [
        { "src": "body.png" },
        { "text": "commitHash", "at": [50, 70], "size": 9, "color": "#7ee787" }
      ]
    }
  }
}
```

### Raíz

| Campo | Qué es | Regla |
|---|---|---|
| `states` | Capas por estado (`coding`, `testing`, `researching`, `planning`, `waiting`, `resting`, `sleeping`, `terminal`, `subagents`, `committing`, `pushing`, `limited`) | al menos un estado conocido |
| `size` | `[ancho, alto]` de las imágenes, por defecto `[150, 110]` | enteros ≤ 4096 con la **proporción 150×110** (apaisada); otra proporción es error, no se deforma |
| `animations` | Animaciones propias, `{nombre: animación}` (ver «Una animación») | ≤ 64; nombre `^[a-z][a-z0-9-]{0,31}$`; **no puede reutilizar un nombre del catálogo de serie** |
| `name` | Nombre para mostrar | 1–40 caracteres |

Cada estado es `{ "layers": [...] }`, de 1 a 32 capas, **pintadas en orden** (la primera, al fondo).
Las coordenadas de `pivot`, `clip` y `at` son las del viewBox 150×110, sea cual sea `size`.

### Capas

Una capa es una **imagen** (`src`) o un **texto** (`text`), nunca las dos cosas.

| Campo | En | Qué es | Regla |
|---|---|---|---|
| `src` | imagen | Ruta de la imagen | relativa a la carpeta de la skin, con `/`; sin `..`, sin ruta absoluta ni URL; png, webp, jpg, gif o svg |
| `anim` | ambas | Animación de la capa | del catálogo de serie o de `animations`; si no existe, error |
| `pivot` | ambas | `[x, y]` alrededor del que se mueve | dentro de la escena |
| `clip` | imagen | `[x, y, ancho, alto]`: solo se ve esa zona (el código que se ve solo dentro de la pantalla) | ancho y alto > 0 y dentro de la escena |
| `frames` | imagen | La imagen es una tira horizontal de N fotogramas, reproducida con `steps()` al tempo de la fatiga | entero 2–64 |
| `beats` | imagen | Duración de la tira entera, en beats (por defecto 1) | solo con `frames` |
| `role` | imagen | `"head"`: la capa que cabecea con la música | como mucho una por estado |
| `text` | texto | El dato de Amnis que se muestra | `commitHash` o `resetsCountdown` |
| `at` | texto | `[x, y]` de la línea base del texto | dentro de la escena |
| `size` | texto | Tamaño de letra en px del viewBox | > 0 y ≤ 110 |
| `color` | texto | Color | solo hex: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` |

La skin decide dónde y cómo se ve el texto; Amnis pone el valor. Es como una skin muestra los datos
que BIT enseña dentro de su escena (el hash de `committing`, la cuenta atrás de `limited`).

### Qué se rechaza y qué se avisa

| Error (la skin no carga) | Aviso (se ignora y sigue) |
|---|---|
| `anim` que no está en el catálogo ni en `animations` | estado desconocido |
| ruta con `..`, absoluta, con `\` o con `:` | campo desconocido en cualquier nivel |
| `color` que no es hex | `role` distinto de `"head"` |
| dos capas `head` en un estado | `text` con un dato desconocido (la capa se descarta) |
| `size` con otra proporción | |
| animación propia inválida o con nombre del catálogo | |

El manifest que devuelve el validador se construye campo a campo: nada desconocido llega al DOM ni
al CSS.

## Instalar y comprobar una skin

Cada skin es una carpeta en `~/.amnis/skins/<id>/` con su `skin.json` y las imágenes que referencia.
El `id` es el nombre de la carpeta (letras, números, `.`, `_` y `-`).

```bash
amnis skin check ~/.amnis/skins/robi
```

Valida el manifest con el mismo validador que usa la mascota y comprueba que **cada imagen
existe**: un error por imagen que falta, con estado, capa y ruta. Un enlace simbólico que apunta
fuera de la carpeta cuenta como imagen ausente. Sale con código ≠ 0 si hay errores; los avisos no
lo cambian.

El daemon lee el disco en cada petición, sin reiniciar:

- `GET /api/skins` — todas las carpetas: `{id, name, states, errors, warnings}`. Una skin rota se
  lista con sus errores; no impide el arranque ni al resto.
- `GET /api/skins/<id>/<ruta>` — una imagen de la skin. Solo sirve imágenes de dentro de su carpeta
  (rutas con `..`, codificadas o no, o enlaces que salen: 404).

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
