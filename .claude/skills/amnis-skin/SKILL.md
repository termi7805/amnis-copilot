---
name: amnis-skin
description: Crea o adapta una skin de la mascota de Amnis Copilot (carpeta en ~/.amnis/skins/ con skin.json y capas SVG/PNG). Úsala cuando pidan crear, dibujar, diseñar, convertir o arreglar una skin o una mascota propia de Amnis, partir de un boceto o diseño, animar una capa, o cuando `amnis skin check` dé errores.
---

# /amnis-skin

Lleva de una idea, un boceto o un diseño terminado a una skin que funciona en
`~/.amnis/skins/<id>/` (en Windows, `%USERPROFILE%\.amnis\skins\<id>\`; `AMNIS_DIR` cambia la raíz).
Puede dibujar Claude o la persona, y se puede partir de cero o de algo ya hecho.

- Formato del manifest, animaciones y catálogo: **`docs/SKINS.md`** del repo de Amnis
  (<https://github.com/termi7805/amnis-copilot/blob/main/docs/SKINS.md>). Léelo antes de escribir
  un `skin.json`; aquí no se copia para que no diverja.
- Qué hace BIT (el personaje de serie) en cada estado: [escenas.md](escenas.md), junto a este fichero.
- `$SKILL` = la carpeta que contiene este `SKILL.md`; los scripts están en `$SKILL/scripts/`.

## Reglas que no se negocian

1. **El validador manda.** Nunca des por buena una skin leyendo el manifest: ejecuta
   `sh $SKILL/scripts/check.sh <carpeta>` y trabaja sobre su salida (usa el mismo validador que la
   mascota). Si dice que algo falla, no lo discutas: arréglalo y vuelve a ejecutarlo.
2. **Cada capa es una imagen que se pinta como `<image>`.** Un SVG de capa: sin `<script>`, sin
   fuentes ni imágenes externas (`data:` sí vale), sin filtros caros (`blur`, sombras): se anima a
   150×110 todo el día en una ventana siempre visible. `check.sh` también revisa esto.
3. **Verla en la mascota real**, no solo validarla. Pide elegirla en Ajustes → *Skin de la mascota*
   (el daemon vigila la carpeta: cada cambio se ve al momento). Si trabajas dentro del repo de
   Amnis con `pnpm dev`, `/lab` pinta la skin en los 12 estados a la vez, con selector de fatiga
   y **con música simulada** (una columna por vibe; «Cambiar pista» fuerza la pantalla «sonando»).
   Si tienes navegador (Claude in Chrome), míralo tú; si no, pide a la persona que te cuente.
   Si ya hay un Amnis instalado ocupando el puerto 4747 (o es una versión sin skins), lanza el
   daemon del repo aparte y apunta Vite a él con el mismo `AMNIS_PORT`:

   ```bash
   # AMNIS_DIR propio con `skins` enlazado a ~/.amnis/skins; CLAUDE_CONFIG_DIR vacío: no sondea Anthropic
   AMNIS_DIR=<tmp>/amnis AMNIS_PORT=4748 CLAUDE_CONFIG_DIR=<tmp>/vacio \
     AMNIS_DEV_ORIGIN=http://localhost:5173 node packages/daemon/src/cli.ts serve
   AMNIS_PORT=4748 pnpm --filter web dev
   ```
4. **Un estado a la vez, validando cada paso.** No escribas los 12 y valides al final.

## 0. Preparar

1. Elige el `id` (letras, números, `.`, `_`, `-`) y crea `~/.amnis/skins/<id>/`.
2. Pide que elija esa skin en Ajustes desde el principio (puede mostrar «error» hasta que haya un
   `skin.json`: es normal).
3. Haz las dos preguntas:
   - **¿De dónde partes?** De cero · De un boceto o diseño que ya tengo.
   - **¿Quién dibuja?** Claude · Yo.

## 1. Partir de cero

Entrevista corta (no más de cuatro preguntas, de una vez): **qué personaje** (animal, objeto,
criatura…), **qué estilo** (plano, contorno, pixel, acuarela…), **paleta** (2–4 colores y fondo
claro u oscuro), **tono** (tierno, serio, gamberro).

Por cada estado propón una escena en una línea: qué hace el personaje, qué objeto lo acompaña y
qué capas se separan. Usa [escenas.md](escenas.md) como referencia, adaptando el objeto al
personaje (un gato no teclea: patea el portátil). Enseña la lista y deja ajustarla antes de dibujar.

Con la lista, haz la pregunta de la música (**§6, «¿Cómo se ve la música?»**): sin respuesta no se
fija la capa `head`.

## 2. Partir de algo ya diseñado

Lee la imagen con `Read` (hoja de personaje, boceto, capturas, piezas sueltas) y devuelve:

- **Reparto en capas**: qué piezas hay, cuáles se mueven solas (brazo, cola, cabeza, objeto) y cuáles
  no (cuerpo, sombra).
- **Estados que cubre** el diseño y cuáles faltan (propón escena para los que faltan).
- **Pivotes y anclajes** mirando la imagen: dónde está el hombro, el cuello, el centro de la cara.
- **La pregunta de la música** (§6, «¿Cómo se ve la música?»), con lo que se ve en la imagen
  delante: si la cara tiene un hueco liso donde quepa la pantalla «sonando» o si la taparía, qué
  objeto de la escena podría enseñar la canción, si tiene orejas para los cascos.

Después, según cómo venga:

- **En capas** (Aseprite, SVG por grupos, PNG separados): exporta cada capa y colócala en el lienzo
  150×110 con `place.mjs` (ver §5). Con Aseprite, si está instalado:
  `aseprite -b --split-layers fichero.aseprite --save-as "{layer}.png"` (comprueba `aseprite --help`).
  Un SVG por grupos se parte copiando cada `<g>` de primer nivel a su propio SVG con el mismo
  `viewBox`.
- **Plano** (un solo dibujo): **recortarlo no basta**: las piezas se solapan y al moverlas queda un
  agujero detrás. Hay dos salidas, y no existe una tercera de «dejar la imagen quieta»:
  - *Dibuja Claude*: redibuja el personaje en capas siguiendo el boceto (formas, proporciones y
    colores que se ven), con las partes ocultas completadas.
  - *Dibuja la persona*: dile qué piezas tiene que separar y qué debe dibujar por detrás de cada
    una (p. ej. el hombro bajo el brazo), y empieza con la skin de marcadores (§4).

## 3. Dibuja Claude

1. **Explora el aspecto en Claude Design** antes de comprometerte con el formato: variantes del
   personaje y de una o dos escenas en un lienzo, iterando con la persona. Si tienes la herramienta
   `Artifact` con el tipo *Design*, úsala (`action: "quickstart"`, `intent: "design"`); si no, sugiere
   claude.ai/design y que traiga la variante elegida (export o captura). El diseño sirve para
   decidir el aspecto: el formato lo produces tú, porque conoces el lienzo, los pivotes y el validador.
2. **Escribe cada capa como un SVG de lienzo 150×110 completo** (guía de estilo en §6): cuerpo,
   cabeza, brazos, objetos, contenido de pantallas. Un fichero por capa móvil; lo que no se mueve
   puede ir junto (cuerpo + sombra).
3. **Escribe el `skin.json`**: `states.<estado>.layers` en orden de fondo a frente, con `anim` y
   `pivot` en cada capa que se mueva, `clip` en lo que se ve dentro de una pantalla, y la cabeza y
   la pantalla «sonando» como se haya respondido a la pregunta de la música (§6). Empieza por
   `coding` y `resting` para fijar el estilo, valida y deja que la persona los vea; después, el
   resto de estados.
4. **Itera estado a estado** mirando la mascota, **también con música**: en `/lab`, cada estado con
   capa `head` o `player` en las columnas de vibe, pulsando «Cambiar pista» para ver la pantalla
   «sonando». La cara no puede quedar tapada salvo que la persona lo haya elegido. Los ajustes en
   palabras («la cola más larga», «el portátil más pequeño») son ediciones del SVG; vuelve a validar
   y a mirar.

## 4. Dibuja la persona

Genera una skin de **marcadores**: rectángulos de color por capa, con su animación y su pivote ya
puestos en los 12 estados. Antes, haz la pregunta de la música (§6, «¿Cómo se ve la música?»): la
respuesta decide los flags.

```bash
node $SKILL/scripts/placeholders.mjs ~/.amnis/skins/<id> --name "Mi skin" [--player head|object|none] [--no-headphones]
sh $SKILL/scripts/check.sh ~/.amnis/skins/<id>
```

`--player head` (por defecto) pone la pantalla sobre la cara; `object`, en un marco rojo
discontinuo (`player.svg`) sobre el objeto del estado, que se mueve con él; `none`, en ninguna
parte. `--no-headphones` quita los cascos. Si la persona no lo tiene claro, `--player object`: es
el que no tapa nada mientras se decide.

Se ve moverse desde el primer minuto. **Dibujar es sustituir cada marcador por su pieza sin tocar el
manifest**: mismo nombre de fichero, lienzo 150×110 (o 300×220 si es PNG: pon `"size": [300, 220]`),
la pieza ya colocada donde va. Explica en el momento en que importan: dónde va el pivote para que
un brazo gire bien (en el hombro, no en el centro), por qué la cabeza es una capa aparte, cómo
recortar lo que se ve dentro de una pantalla. Si más adelante hay piezas sueltas, `place.mjs` las
coloca (§5).

## 5. Scripts

Todos son `node` sin dependencias (Node ≥ 18). Sin Node, escribe a mano el mismo SVG.

| Script | Para qué |
|---|---|
| `placeholders.mjs <carpeta> [--name X] [--player head\|object\|none] [--no-headphones] [--force]` | skin de marcadores animada, 12 estados, con la música colocada según la respuesta de §6 |
| `place.mjs <pieza> <salida.svg> --at x,y --width w [--height h] [--rotate g] [--about x,y]` | coloca y escala un png/svg en el lienzo 150×110 (el png se incrusta como `data:`) |
| `strip.mjs <salida.svg> <f1.svg> <f2.svg> …` | une fotogramas en una tira para `frames` |
| `lint-svg.mjs <carpeta>` | lo que el validador no mira: scripts, recursos externos, filtros, proporción del `viewBox` |
| `check.sh <carpeta>` | validador de Amnis + `lint-svg.mjs`; busca el validador solo (repo, `amnis` en el PATH, `$AMNIS_CLI` o el daemon en marcha) |

## 6. Guía de estilo del SVG de capas

**Lienzo.** Todas las capas miden `viewBox="0 0 150 110"` y se estiran al mismo lienzo
(`preserveAspectRatio="none"`): la pieza se dibuja **ya en su sitio**, no recortada a su tamaño. Las
coordenadas de `pivot`, `clip`, `at` y `anchor` son siempre las de ese viewBox.

**Pivotes.** El pivote es el punto fijo del giro: hombro para un brazo, base del cuello para la
cabeza, raíz para una cola o antena, el centro de la pieza para algo que late. Un pivote en el centro
de un brazo largo lo hace girar «sobre sí mismo» y se ve mal. `pivot` va en la capa, no en la
animación, así que una misma animación sirve con cualquier pivote.

**Contacto con los objetos.** Si la mano toca un objeto (teclado, lupa, taza) y uno de los dos se
mueve, el contacto se rompe. Mueve los dos con la misma animación y el mismo pivote, o deja quieto
el objeto y anima solo una parte (la lupa sobre un documento fijo). Deja la punta del brazo
**solapando** el objeto unos píxeles, no rozándolo.

**Qué capas separar.** Una capa por cosa que se mueva distinto: cuerpo, cabeza, cada brazo, el
objeto, lo que se ve dentro de una pantalla. Lo que se mueve igual va junto.

**Contenido de pantallas.** El contenido (líneas de código, un cursor) va en su propia capa, **más
grande que la pantalla**, con `clip: [x, y, ancho, alto]` sobre la pantalla y una animación
(`scroll` lo desplaza a saltos, `cursor` parpadea). Sin `clip` se vería salir de la pantalla.

**¿Animación propia o tira de fotogramas?**
- Movimiento rígido (girar, subir, escalar, aparecer): animación de keyframes. Barata y se ralentiza
  con la fatiga sin hacer nada. Es lo normal.
- La forma cambia (boca que habla, llama, parpadeo con cambio de dibujo): tira de `frames`. La
  imagen es una tira horizontal de N lienzos (`150·N × 110`), `frames: N` (2–64) y `beats` para la
  duración de la tira entera. Sale más cara de pintar: úsala solo donde haga falta. `strip.mjs` las monta.

**Cabeza y música.** Con Spotify vinculado, la mascota pinta tres cosas mientras suena algo: la
cabeza **cabecea** al ritmo, lleva **cascos** y una **pantalla «sonando»** (54×40·`scale` px) enseña
la canción. Dónde va cada una es una decisión de diseño del personaje, no un cálculo: la toma la
persona. Al dibujar casi nunca suena nada, así que si no se pregunta, nadie ve hasta usar la skin
que la pantalla le tapa la cara al personaje en cada cambio de pista.

*¿Cómo se ve la música?* Pregúntalo antes de fijar la capa `head` (§1, §2 o §4), en los dos flujos.
Pon delante las opciones y lo que implica cada una:

1. **Pantalla sobre la cara.** Solo si el personaje tiene en la cara un hueco liso donde quepa sin
   taparlo (BIT: su cara *es* una pantalla). Capa `head` sin más campos. En un personaje con ojos,
   boca u hocico lo deja sin cara mientras se ve la canción: avísalo si lo eligen.
2. **Pantalla en un objeto** (la pantalla del portátil, un cartel, un bocadillo). Una capa
   `role: "player"` con su `anchor` (centro del hueco) y su `scale`. Se mueve con la `anim` y el
   `pivot` de esa capa, no cabecea, y la tapan las capas que vayan después en la lista (pon detrás
   del reproductor lo que deba quedar debajo, como el contenido de esa pantalla). Hay que decidirlo
   **por estado**: en los que no tengan objeto (dormir, p. ej.), otra capa, o sin pantalla en ese estado.
3. **Sin pantalla.** `"player": false` en la `head` y ninguna capa `player`. Siguen el cabeceo, las
   notas, el color y, si los hay, los cascos.

**Cascos**, aparte y con cualquiera de las tres: con cascos (por defecto) o `"headphones": false`
(un personaje sin orejas, con sombrero, o al que no le pegan). Van siempre en la `head`.

**Sin capa `head`** solo si el personaje no debe cabecear: sin ella se pierden a la vez cabeceo y
cascos, y la pantalla solo sale si hay capa `player`; quedan notas y color. Para quitar solo los
cascos o solo la pantalla, los dos campos de arriba, no quitar la `head`.

**Tamaño.** En la `head`, `scale` ≈ ancho de la cabeza / 62 (la de BIT mide 62 px; 1 = igual).
Para afinarlo: los cascos quedan a ±40·`scale` px de `anchor` en horizontal, así que `scale` =
media distancia entre las orejas / 40 los pone sobre ellas. Comprueba con ese `scale` que la
pantalla (54×40·`scale`) cabe donde se ha elegido: sobre la cara, que no la desborde; con cascos,
que no choque con ellos. En una `player`, `scale` ≤ ancho del hueco / 54 y ≤ alto / 40.

**Anclajes.** `anchor` es obligatorio en `head` y en `player`: en la `head`, el centro de la cara,
donde se centran los cascos (y la pantalla, si va ahí); en la `player`, el centro del hueco. Con
`pivot` la cabeza cabecea girando en torno a él (el cuello); sin él, en torno a `anchor`. Si en un
estado el personaje se dibuja a otra escala o en otra posición, `anchor`, `pivot` y `scale` de ese
estado se recalculan con la misma transformación. Como mucho **una** `head` y **una** `player` por
estado. `waiting` y `limited` no llevan capa de música, como en BIT.

**Lo que el formato no hace**: cascos fuera de la `head` o dos pantallas en un estado. Si la
persona pide algo así, dilo claro y ofrece la opción más cercana; no fuerces un `anchor` que deje los cascos fuera de las orejas.

Quien use la skin puede quitar la pantalla en Ajustes → Música (pantalla «Nada»), pero es
preferencia de quien mira, no de la skin: por defecto sale, así que la skin tiene que quedar bien
con ella.

**Datos de Amnis (capas `text`).** `commitHash` (solo llega en `pushing`; en `committing` se ve
`······`) y `resetsCountdown` (para `limited`). Eres tú quien decide `at` (línea base, esquina
inferior izquierda del texto), `size` (px del viewBox; el hash son 7 caracteres ≈ 4·`size` px de
ancho en monoespaciada) y `color` (solo hex). Colócalos sobre algo de fondo liso con contraste:
caja, cartel, pantalla. Si ese fondo se mueve, da a la capa de texto la misma `anim` y el mismo
`pivot` que a su imagen: si no, el texto se queda quieto y se despega.

**Qué evitar.** `<script>` y manejadores `onclick`; `<foreignObject>`; `<image href="fichero.png">` o
cualquier URL externa (incrusta con `data:`); `@import`; `<text>` con fuentes (pásalo a trazos);
`filter`, `feGaussianBlur`, `feDropShadow`; degradados con cientos de paradas; SVG de >500 KB.
Sombras: una elipse semitransparente, no un filtro.

## 7. Animaciones propias desde palabras

Primero busca una de serie en el catálogo de `docs/SKINS.md` (`bob`, `swing`, `nod`, `tap`, `zzz`…):
si ya hace lo que dice la persona, úsala. Si no, escribe una en `animations` del manifest
(nombre `^[a-z][a-z0-9-]{0,31}$`, **sin reutilizar** uno del catálogo):

| Dicen | Traducción |
|---|---|
| «que la cola se menee despacio» | `rotate` ±12° entre `at: 0/50/100`, `beats: 2.6`, pivote en la raíz de la cola |
| «que salte al terminar» | `y` 0 → −8 → 0, `easing: "ease-out"`, `beats: 1` |
| «que respire» | `scale` `[1, 1]` → `[1.02, 1.035]`, `beats: 3.4`, pivote en la base |
| «que parpadee de vez en cuando» | `scale` `[1, 0.1]` solo en `at: 92–96`, `beats: 4.5` (la mayor parte, quieto) |
| «que el texto avance por saltos» | `steps: 4`, `y` 0 → −24 |

```json
"animations": {
  "meneo": {
    "beats": 2.6,
    "keyframes": [
      { "at": 0, "rotate": -12 },
      { "at": 50, "rotate": 12 },
      { "at": 100, "rotate": -12 }
    ]
  }
}
```

- La duración va en **beats, no en segundos**: la mascota se ralentiza con la fatiga (hasta ×2.6)
  sola. Un movimiento que «se ve lento» se arregla subiendo `beats`, no con `delay`.
- `at` estrictamente creciente de 0 a 100; un ciclo suave termina igual que empieza.
- Si usas `x`, `y`, `rotate` o `scale` en algún fotograma, los que omitan alguno vuelven a la
  identidad. `opacity` omitida se interpola.
- Un movimiento que no se nota a 150×110 (±1°, ±0.5 px) no existe: exagera hasta que se vea.
- `prefers-reduced-motion` apaga las animaciones; la imagen quieta tiene que quedar bien.

## 8. Errores frecuentes del check

La salida de `check.sh` nombra estado, capa y campo (`states.coding.layers[1].anim: …`).

| Dice | Arreglo |
|---|---|
| `anim … no existe` | nombre mal escrito, o falta declararla en `animations`; mira el catálogo en `docs/SKINS.md` |
| `pivot … queda fuera de la escena` | el pivote va en coordenadas del viewBox 150×110 (0–150 × 0–110), no en px de la imagen |
| `no existe la imagen "…"` | el fichero no está o la ruta no coincide (mayúsculas, subcarpeta) |
| `ruta inválida` | `/` como separador, sin `..`, sin ruta absoluta, solo letras, números, `.`, `_`, `-` |
| `la capa con role "head" necesita anchor` | añade `anchor: [x, y]` (el centro de la cara) |
| `la capa con role "player" necesita anchor` | añade `anchor: [x, y]` (el centro de donde se ve la canción) |
| `como mucho una capa con role "head"` / `"player"` | solo una cabeza y un reproductor por estado |
| `headphones` / `player` `debe ser true o false` | booleano sin comillas |
| aviso `headphones`/`player` `solo tiene efecto con role "head"` | van en la capa `head`; para mover la pantalla usa `role: "player"` |
| `el recorte … debe caber en la escena` | `clip: [x, y, ancho, alto]` dentro de 150×110 |
| `size … no tiene la proporción` | `size` debe ser 15:11 (300×220, 450×330…) |
| `animations.<x>: ya es una animación de serie` | cambia el nombre de la tuya |
| `color … no es un color hex` | `#rrggbb` (o `#rgb`, `#rrggbbaa`) |
| aviso `estado desconocido` / `campo desconocido` | errata, o de una versión más nueva de Amnis: se ignora |

Si rompes algo a propósito para probar, comprueba que `check.sh` sale con código ≠ 0 y lo explica.

## 9. Al terminar

- `check.sh` en verde, sin avisos que no entiendas, y la skin vista en la mascota en todos los estados
  que declara (y con fatiga alta: `/lab` tiene el selector).
- Vista **con música sonando** en todos los estados con capa `head` o `player`: en `/lab` (columnas
  de vibe, «Cambiar pista» para la pantalla «sonando») o con Spotify real. Cascos sobre las orejas,
  pantalla donde se eligió y la cara al descubierto, salvo que la persona haya elegido taparla.
- Para compartirla basta con la carpeta (`skin.json` + imágenes): quien la reciba la deja en su
  `~/.amnis/skins/` y la elige en Ajustes.
- Di qué estados cubre y cuáles se pintan aún como BIT.
