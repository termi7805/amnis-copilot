# Qué hace BIT en cada estado

Referencia para proponer la escena de cada estado de una skin nueva. BIT es el personaje de serie
(un robot con pantalla por cara); sus capturas están en `docs/assets/states/<estado>.png` del repo
de Amnis. Una skin no tiene que copiar la escena, pero **cada estado debe leerse de un vistazo**
con el personaje a 150×110 px: un personaje, un objeto que cuente qué pasa y un movimiento.

El estado lo decide Amnis a partir de los hooks de Claude Code, no la skin; la skin solo lo dibuja.

Convenciones que se repiten en BIT y conviene mantener:

- El personaje a la izquierda (cuerpo centrado hacia x≈55) y el objeto a la derecha (x≈85–140).
- Brazo que llega al objeto: capa propia con el pivote en el hombro, para que pueda moverse.
- La cabeza, en una capa aparte con `role: "head"` si la skin quiere cascos y pantalla «sonando»
  cuando suena música (ver SKILL.md).
- Una sombra suave en el suelo (elipse) en la capa del cuerpo.

| Estado | Qué hace Claude Code | Qué hace BIT | Objeto y capas | Animaciones de serie que podrían encajar (sugerencia, no lo que usa BIT) |
|---|---|---|---|---|
| `coding` | Edita o escribe ficheros | Teclea en un portátil, ceño concentrado | portátil (base) + contenido de la pantalla con `clip` + 2 brazos | cuerpo `bob`, brazos `tap` (uno con `delay`), contenido `scroll`, cursor `cursor` |
| `testing` | Lanza tests | Señala una checklist con dos ✓ hechos y uno pendiente | tablilla + ✓ + barra de progreso | brazo `swing`, ✓ `pop`, barra `glow` |
| `researching` | Lee, busca o navega | Mira con una lupa sobre un documento | documento + lupa (capa propia) | lupa `wander`, cuerpo `breathe` |
| `planning` | Está en modo plan | Pensativo ante un tablero con una ruta y una bandera | tablero + ruta + bandera | bandera `drift`, brazo levantado `swing` |
| `waiting` | Pide permiso o hace una pregunta | Sorprendido ante un candado con «?»; **tono ámbar** | candado + «?» | candado `swing`, «?» `pop`, brazo `knock` |
| `resting` | Terminó su turno | Sonríe con una taza humeante | taza + plato + vapor | taza `sip`, vapor `steam` |
| `sleeping` | Un rato sin actividad | Ojos cerrados, conectado a una batería | cable + batería + «z» | «z» `zzz`, o tira de `frames`; cuerpo `breathe` |
| `terminal` | Ejecuta otros comandos | Cara `>_`, ante una ventana de terminal | ventana + prompt + cursor | cursor `cursor`, líneas `scroll` |
| `subagents` | Lanza subagentes | Reparte trabajo; tres mini-robots a la derecha | 3 miniaturas | miniaturas `hop`, `bob` (una con `delay`) |
| `committing` | `git commit` | Sella una caja con una etiqueta | caja + sello | sello `tap`, caja `pop` |
| `pushing` | `git push` | Pone la caja en una cinta hacia una nube | cinta + caja con **hash** + nube + flecha | caja `drift`, flecha `pulse` |
| `limited` | Cuota agotada | Agotado, **tono rojo**, ante un cartel «LÍMITE» con la **cuenta atrás** | cartel + reloj + texto | cartel `swing`, cuerpo `shake` |

## Datos de Amnis dentro de la escena

Solo dos, y se pintan con una capa `text` (el manifest decide dónde, tamaño y color):

- `commitHash` — el hash corto del último commit. Amnis lo manda **solo en `pushing`**; en
  `committing` el commit aún no existe y se vería el marcador `······`.
- `resetsCountdown` — lo que falta para que se reinicie la ventana de 5 h. Pensado para `limited`.

Con `limited` y `waiting` no hay capa de música (como en BIT).

## Estados que no se dibujan

Un estado que la skin no declara se pinta como BIT: se puede empezar por unos pocos (`coding`,
`resting`, `sleeping`) y completar después. Mezclar la skin con BIT es válido, pero se nota; para
una skin terminada conviene cubrir los doce.

## Tono por fatiga

La mascota se ralentiza al consumir la ventana de 5 h (hasta ×2.6) sin que la skin haga nada,
porque las animaciones se miden en *beats*, no en segundos. No hay que dibujar variantes «cansado».
