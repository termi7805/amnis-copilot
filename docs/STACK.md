# Amnis Copilot — Stack y arquitectura

> Complementa a [`DESIGN.md`](./DESIGN.md), que decide **qué** se construye y por qué.
> Este documento decide **con qué**, y deja escrito el porqué para no rediscutirlo.

## 1. Resumen

| Capa | Elección | Por qué |
|---|---|---|
| Monorepo | pnpm workspaces + TypeScript | Tipos compartidos entre daemon y clientes |
| Daemon | Node 24, **cero dependencias en runtime** | `node:sqlite` y type-stripping nativos: sin build step |
| Frontend | **React 19 + Vite** en `apps/web` | Dashboard y mascota comparten la criatura; ecosistema conocido |
| Estilos | CSS Modules | Sin dependencias; el `<Pet>` es CSS y SVG a mano |
| Gráficas | SVG propio; Recharts solo si 5.3 lo pide | Un anillo de progreso son 40 líneas, no una librería |
| Mascota | Tauri v2 apuntando al daemon por HTTP | Un solo bundle; remote-ready desde el día 1 |
| Tests | `node:test` en daemon, Vitest en UI | El daemon se testea sin instalar nada |
| Lint/formato | Biome | Un paquete en vez de ESLint + Prettier + plugins |
| CI | GitHub Actions | Lint + tests en cada push |

## 2. Frontend: React 19 + Vite, un solo bundle

**Un único `apps/web`** que produce las dos vistas. No son dos aplicaciones: son dos rutas
del mismo bundle, porque **comparten la criatura**. El dashboard enseña el bicho al lado de la
cuota, y mantener dos copias del mismo SVG en dos builds es la forma más rápida de que diverjan.

### La criatura se comparte; la envoltura no

Las dos vistas **no** enseñan la mascota igual, y esa diferencia tiene un sitio concreto:

| | Ruta `/pet` (Tauri) | Dashboard |
|---|---|---|
| Contenedor | Viewport completo, fondo transparente, arrastrable, sin marco | Tarjeta de ~160 px junto a los anillos de cuota |
| Qué añade | Región de arrastre, click-through, indicador de desconexión | Etiqueta del estado, enlace al detalle |
| Criatura | **El mismo `<Pet>`** | **El mismo `<Pet>`** |

`<Pet>` recibe `{state, level, fatigue}`, escala a su contenedor y **no tiene fondo, ni marco,
ni tamaño propio**. Todo lo que sea "cómo se presenta" vive en la envoltura, no en él. Es la
misma regla que `DESIGN.md` §4 aplica a los sprites, extendida al layout: si `<Pet>` supiera
que a veces flota sobre el escritorio, la ventana de Tauri y el dashboard empezarían a pelearse
dentro del mismo componente.

**React y no Svelte**, aunque el `<Pet>` (animación pura, CSS scoped) habría encajado mejor en
Svelte: el dashboard es donde vive la mayor parte del trabajo, y ahí el ecosistema de React
—Recharts, TanStack Table— y la soltura previa pesan más que los ~45 KB de runtime, que en
`127.0.0.1` son cosméticos.

**Gráficas a mano por defecto.** Los medidores de 5h/7d son un `<circle>` con `strokeDasharray`:
meter una librería para eso es más código, no menos, y menos control sobre un elemento que
además tiene que combinar con la estética de la mascota. Recharts entra **solo** si la vista
histórica (5.3) lo pide, y como dependencia de `apps/web`, nunca del daemon.

## 3. Dónde vive cada frontend

```
                      apps/web (React + Vite)
                           │ pnpm build
                           ▼
                      apps/web/dist ───────┐
                                           │ servido como estático
   Tauri webview ──► http://127.0.0.1:4747/pet
   Navegador     ──► http://127.0.0.1:4747/
                                           │
                                    amnis-daemon
```

**La mascota carga su UI del daemon**, no de un bundle propio dentro del `.app`. Un solo build,
un solo `<Pet>`, y el día que se exponga por túnel (Tailscale/Cloudflare) la mascota ya funciona
desde otra máquina sin tocar nada — que es exactamente el motivo por el que `DESIGN.md` §1 exige
"todo por HTTP con URL configurable".

El coste es que si el daemon no responde, el webview no tiene qué pintar. Se paga con una
**página local mínima empaquetada en Tauri** ("desconectada", con reintento), que además es la
misma señal que pide la issue 6.3: mejor un bicho que dice "no veo nada" que uno que finge.

**En desarrollo** el dev server de Vite sirve la UI con HMR y proxea `/api` al daemon; en
producción el daemon sirve `apps/web/dist` directamente. La URL base del daemon es
configurable en el cliente, nunca `localhost` hardcodeado.

### La única grieta: el panel de cuota necesita redimensionar la ventana

`DESIGN.md` §4 añade un panel que se despliega con click. En el navegador eso es un `div` que
crece; **dentro de Tauri hay además que redimensionar la ventana nativa**, o el panel se recorta.
Es el único punto donde la web habla con Tauri, y rompe la propiedad de que el frontend sea
ignorante de dónde corre.

Se acota así: la ruta `/pet` **detecta si está dentro de Tauri** (`window.__TAURI_INTERNALS__`) y
solo entonces llama a `getCurrentWindow().setSize()`. En un navegador normal el panel se despliega
igual, sin redimensionar nada. Nunca un `import` de `@tauri-apps/api` en el camino crítico: carga
diferida, y si falla, el panel sigue funcionando.

La preferencia plegado/desplegado va en **`localStorage`, no en SQLite**: la BD es una caché
que se reconstruye con `amnis ingest --rebuild`, y perder un ajuste de UI al reconstruir datos
sería un bug difícil de atribuir.

El **tema** es lo contrario (#121): va en `settings.json` del daemon, porque el navegador y la
ventana Tauri son dos webviews sin `localStorage` común y deben ver una sola elección (por SSE,
como `petFocus`). `localStorage` (`amnis-theme`) queda solo como caché de primer pintado para el
script inline de `index.html`: cuando llegan los ajustes, gana el daemon.

## 4. Rutas: la API bajo `/api`

El daemon sirve dos cosas por el mismo puerto, así que se separan por prefijo:

| Ruta | Qué |
|---|---|
| `GET /` | Dashboard (SPA) |
| `GET /pet` | Mascota (misma SPA, otra ruta) |
| `GET /api/state` | `StateResponse`: mascota + cuota + salud del daemon |
| `GET /api/usage` | Agregados por día, proyecto y modelo |
| `GET /api/events` | SSE: cambios de estado y de cuota |
| `POST /api/hook/claude` | Receptor de hooks, fire-and-forget |
| `POST /api/spotify/login` | Inicia el OAuth PKCE de Spotify: el daemon abre el navegador |
| `GET /api/spotify/callback` | Redirect de Spotify: valida `state`, guarda el token |
| `POST /api/spotify/logout` | Borra el token de Spotify (conserva el Client ID); `media` pasa a `not-logged-in` sin reiniciar (escritura) |
| `POST /api/hooks/install` | Repara los hooks de Amnis en `~/.claude/settings.json`: merge no destructivo con copia de seguridad → `{ added, backup }` (escritura) |
| `POST /api/ingest/rebuild` | Reconstruye la caché de uso en un proceso aparte: `202` y evento SSE `rebuild` `{ status: "done" \| "error" }` al terminar; `409` si ya hay una (escritura). Comparte ejecutor con la ingesta automática (§7) |
| `POST /api/media/{play,pause,next,previous}` | Transporte de la reproducción de Spotify (escritura) |
| `POST /api/media/{seek,shuffle,repeat,transfer}` | Ajustes y transferencia entre dispositivos, con body JSON (escritura) |
| `GET /api/media/devices` | Dispositivos Spotify Connect, bajo demanda (no entra en el polling) |
| `POST /api/media/refresh` | La UI avisa de que alguien mira (foco de la ventana): lectura ya y sondeo rápido ~2 min |

Sin auth de usuario (no hay dato de otra persona en juego), pero **con protección de origen en
las rutas de escritura** (#88). Escuchar en loopback impide que entre otra máquina, no que entre
otra *web*: cualquier página abierta en tu navegador puede hacer `fetch("http://127.0.0.1:4747/api/media/pause",
{method: "POST"})`, y con DNS rebinding incluso leer respuestas. Por eso todo método distinto de
`GET`/`HEAD` pasa por `checkOrigin` antes de despachar, y responde 403 si no cumple:

- `Host` tiene que ser `127.0.0.1:PORT` o `localhost:PORT`. Eso corta el DNS rebinding.
- `Origin`, **si viene**, tiene que ser el propio daemon. Sin `Origin` (el `curl` del hook, la
  CLI) se acepta: un navegador siempre lo manda en un POST cross-origin. La mascota de Tauri
  carga la UI desde el daemon, así que su `Origin` ya es el del daemon.
- En desarrollo el navegador habla con Vite; el origen del dev server se admite solo si
  `AMNIS_DEV_ORIGIN` está definida, y únicamente la define el script `dev` del daemon.

Los `GET` quedan fuera: leen datos propios y son seguros ante CSRF, pero un DNS rebinding
podría leerlos. Es un límite conocido. El día del túnel, el auth se añade en una sola capa
delante de `/api`.

### El contrato del SSE

Tres consumidores distintos leen `/api/events` (la mascota, su panel de cuota y el dashboard), así
que el formato se declara **una vez en `packages/shared/src/types.ts`** y no se improvisa en cada
cliente.

| `event:` | `data:` | Cuándo |
|---|---|---|
| `state` | `PetSnapshot` | Cambia el estado de la mascota |
| `quota` | `QuotaSnapshot[]` | Nueva muestra (cada 180 s, o al degradar) |
| `media` | `MediaSnapshot` | Cambia lo que suena (polling adaptativo de Spotify, solo con clientes conectados). Sale primero con `vibe: "neutral"`; la vibe y el BPM de ReccoBeats llegan en un segundo `media` |
| `hello` | `StateResponse` | Primer mensaje tras conectar |

`hello` existe para que **un cliente que acaba de conectar no tenga que hacer también un `GET
/api/state`**: sin él, toda UI arranca con dos peticiones y una ventana en la que pinta datos
vacíos. Con él, conectarse es una sola operación.

Cada mensaje lleva `id:` con el timestamp, para que la reconexión automática de SSE mande
`Last-Event-ID` y el daemon sepa si el cliente se perdió algo. `retry: 2000` en la cabecera del
stream: la mascota tiene que volver rápido, no ser educada.

## 5. Tooling

**El "cero dependencias" aplica al runtime del daemon, no a las dev-deps.** El daemon tiene que
poder ejecutarse con un `node` pelado y nada más; que el repo tenga un linter no lo contradice.

- **`node --test packages/daemon`** — Node 24 ejecuta TypeScript sin build, así que el daemon se
  testea sin `node_modules` en medio. Aquí vive el test que más importa del proyecto: el de
  regresión del doble conteo (issue #11), el bug que no peta, solo miente.
- **Vitest + Testing Library** en `apps/web`, que necesita el pipeline de Vite igualmente.
- **Biome** para formato y lint del monorepo entero: un paquete, y rápido.

## 6. Empaquetado del daemon: sidecar Node SEA (#41)

Tauri lanza el daemon como **sidecar**: un binario autocontenido producido con **Node SEA**
(single executable application), así que la app arranca en una máquina sin Node instalado.
`pnpm --filter @amnis/daemon build:sea` (`packages/daemon/scripts/build-sea.ts`) lo genera, y
`tauri build` lo invoca solo vía `beforeBuildCommand`.

Lo que se midió antes de decidirlo, y que condiciona el build:

- **`node:sqlite` funciona dentro del SEA** (Node 24.15), con el entorno vacío (`env -i`). Era la
  premisa que podía tumbar la estrategia entera; no la tumba.
- **Node 24 no acepta ESM como entrypoint de un SEA** (`mainFormat: "module"` falla al cargar).
  Por eso hay un paso de bundle: esbuild aplana `src/cli.ts` —con `@amnis/shared` dentro— a un
  solo `dist/amnis.cjs`. esbuild y postject son tooling; el daemon sigue sin dependencias en
  runtime.
- **El binario pesa ~123 MB**: es el `node` entero con el blob inyectado.

**Recursos fuera del binario.** El SPA, el dashboard de depuración y el script del hook viajan
como `bundle.resources` de Tauri, no dentro del blob: `createStaticRoute` sigue sirviendo desde
disco sin cambios. `resolveResources()` (`config.ts`) decide de dónde salen: `AMNIS_RESOURCES_DIR`
(lo pasa Tauri) → junto al ejecutable si es SEA → el repo si corre con `node`.

**El hook se copia a `~/.amnis/hooks/`** al hacer `install-hooks`: `settings.json` necesita una
ruta estable, y una AppImage monta sus recursos en una ruta distinta en cada arranque.

**Ciclo de vida.** La app solo lanza el sidecar si no hay ya un daemon escuchando (en desarrollo,
el de `pnpm dev` gana y no se toca). Lo lanza con `serve --exit-with-parent`: el daemon se cierra
al recibir EOF en su stdin, que es lo que pasa cuando la app muere por cualquier vía —SIGTERM y
crash incluidos, que `RunEvent::Exit` no cubre—.

**macOS (#130).** El `node` que se copia viene firmado por su autor: el build le quita la firma,
inyecta el blob en el segmento Mach-O `NODE_SEA` y lo vuelve a firmar ad-hoc. Sin una firma
válida, Apple Silicon mata el proceso al arrancar. La app entera también se firma ad-hoc
(`signingIdentity: "-"`), no con Developer ID: sin cuenta de Apple no hay notarización, y quien
la descarga tiene que quitarle la cuarentena una vez. Un `.dmg` por arquitectura, cada uno en su
runner nativo, porque el SEA es el `node` del build y no se compila en cruzado. La ventana
transparente necesita `macos-private-api`, y `ActivationPolicy::Accessory` hace en macOS lo que
`skip_taskbar` hace en Linux: que la mascota no salga en el Dock.

**Windows (#133).** Tauri busca el sidecar con la extensión de la plataforma, así que el build
lo nombra `amnis-daemon-<triple>.exe`. El `node.exe` que se copia viene firmado con
Authenticode, y la inyección invalida esa firma: el binario arranca igual, sin firmar. Sin
certificado de código, SmartScreen avisa la primera vez. Se empaqueta solo NSIS (`-setup.exe`),
que instala por usuario sin administrador, y no MSI. Tauri lanza el sidecar sin consola, pero
`node.exe` es una app de consola: sus hijos (la ingesta, `git`) se lanzan con `windowsHide` o
cada uno abriría una ventana de cmd. El hook sigue siendo el mismo script `sh`, porque Claude
Code ejecuta los hooks con Git Bash también en Windows. Su ruta se registra con `/`
(`C:/Users/…`), que entienden igual msys y Windows. Solo x86_64: ARM64 necesitaría su propio
runner, por la misma razón que en macOS.

## 7. Layout y arquitectura interna

```
amnis-copilot/
├── docs/                    DESIGN.md · STACK.md
├── packages/
│   ├── shared/
│   │   └── src/types.ts     contrato daemon ↔ clientes
│   └── daemon/
│       ├── src/
│       │   ├── domain/      lógica pura, sin I/O
│       │   │   ├── petState.ts      evento → estado + temporizador de sleeping
│       │   │   ├── fatigue.ts       utilización → fatiga
│       │   │   ├── localQuota.ts    tokens de la ventana → % estimado
│       │   │   ├── cost.ts          tokens + modelo → coste
│       │   │   └── Provider.ts      el contrato que infrastructure implementa
│       │   ├── application/ casos de uso
│       │   │   ├── ingestUsage.ts   recorrido incremental por offsets
│       │   │   ├── sampleQuota.ts   doble vía + divergencia
│       │   │   ├── recordHook.ts    normaliza, persiste, deriva estado
│       │   │   └── getState.ts      compone StateResponse
│       │   ├── infrastructure/
│       │   │   ├── providers/anthropic/  transcripts · quota · credentials · hooks
│       │   │   ├── persistence/          un módulo por agregado
│       │   │   │   ├── db.ts             esquema + migración + apertura
│       │   │   │   ├── usage.ts          insertar · agregar por proyecto/modelo/día
│       │   │   │   ├── hookEvents.ts
│       │   │   │   ├── quotaSamples.ts
│       │   │   │   └── ingestOffsets.ts
│       │   │   ├── http/                 node:http, rutas /api, SSE, estáticos
│       │   │   └── cli/                  amnis: ingest · doctor · install-hooks · serve
│       │   └── config.ts
│       ├── hooks/           claude-hook.sh
│       ├── public/          la página fea de la rebanada vertical, sin build
│       └── test/            *.test.ts + fixtures/ de JSONL reales
└── apps/
    ├── web/                 React 19 + Vite
    │   └── src/
    │       ├── lib/Pet/     la criatura, compartida por las dos rutas
    │       ├── routes/      dashboard/ · pet/  (las dos envolturas)
    │       ├── api/         cliente HTTP + hook de SSE
    │       └── main.tsx
    └── pet/                 Tauri v2 (Rust)
        ├── src-tauri/
        └── fallback/
            └── index.html   fallback empaquetado, sin React (#39)
```

### El criterio: `packages/` es lo que se importa, `apps/` es lo que se ejecuta

`apps/web` está en `apps/` y no en `packages/` porque **nadie lo importa como código**. Al
decidir que Tauri carga la UI por HTTP (§3), `apps/pet` dejó de tener un solo `import` de
TypeScript: es Rust abriendo una URL. La criatura se comparte entre dos rutas del mismo bundle,
no entre dos paquetes — así que el frontend no es una librería, es una app que el daemon sirve.

Y `web` en vez de `dashboard` porque sirve las dos vistas.

### Tres capas, y solo un contrato

`domain` · `application` · `infrastructure`. Sin carpetas `ports/` ni `adapters/`: los nombres de
capa ya dicen quién define el contrato y quién lo implementa, y una carpeta llamada `ports` con un
solo fichero dentro es ceremonia.

**La regla para crear contratos, y se aplica sin excepciones:** ¿hay una segunda implementación
prevista? Sí → interfaz en `domain/`. No → función directa. Un andamiaje de interfaces "por si
acaso" sobre un daemon de unos pocos miles de líneas es el mismo error que empezar por la mascota,
con otra cara.

Eso deja **un solo contrato**, `domain/Provider.ts`, con la mejor justificación posible: la segunda
implementación existe y está descrita (`DESIGN.md` §6). Antigravity son `.pb` y `.db` sin esquema
público frente a JSONL legible — no hay forma de que compartan código, solo contrato. Vive en
`domain/` y no en `infrastructure/` precisamente para que la dependencia apunte hacia dentro: el
núcleo declara qué necesita, y `infrastructure/providers/anthropic/` obedece.

**El segundo motivo para `application/` no son los providers: son las dos formas de entrar.**
El CLI (`amnis ingest`, `amnis doctor`) y el servidor HTTP hacen lo mismo por dos vías distintas.
Sin casos de uso en medio, o esa lógica se duplica o el CLI acaba importando del servidor, que es
peor. `application/` existe para que `amnis ingest` y una futura ruta de ingesta sean dos puertas
al mismo código — y por eso `http/` y `cli/` son **hermanos** dentro de `infrastructure/`, no uno
colgando del otro.

**Regla de dependencias:** `domain/` no importa nada del proyecto. `application/` importa
`domain/`. `infrastructure/` importa las dos. Nunca al revés — si una pieza de `infrastructure/`
necesita algo de otra, sube a `application/` o baja a `domain/`.

### Por qué `persistence/` son módulos y no repositorios

La duda razonable es: si van a entrar Claude, Antigravity y lo que venga, ¿no toca un repositorio
por proveedor? **No, porque múltiples proveedores son múltiples *fuentes*, no múltiples *almacenes*.**

Leerlos no se parece en nada —JSONL frente a `.pb` y `.db` sin esquema público—, y esa variabilidad
ya tiene su contrato: `domain/Provider.ts`. Pero una vez normalizados, todos caen en **la misma
`usage_events` con una columna `provider`**, que es lo que `DESIGN.md` §3 ya decidió y `db.ts`
ya implementa, igual que `accounts.provider`.

Fragmentarlo tendría un coste concreto: con un repositorio por proveedor, *"¿cuánto he consumido
esta semana entre todos?"* —la razón de ser del dashboard— deja de ser un `GROUP BY provider` y pasa
a juntarse en memoria desde dos implementaciones. La columna existe justamente para evitar eso.

Los otros dos argumentos habituales del patrón tampoco se sostienen aquí:

- *"Poder cambiar de motor."* Cambiar `node:sqlite` rompería el "cero dependencias", que es una
  premisa del proyecto y no un detalle de implementación.
- *"Poder testear sin BD."* `node:sqlite` abre bases en `:memory:`, así que los tests corren contra
  SQLite de verdad. Un doble te daría un test **peor**: verde contra un fake que no tiene los
  `UNIQUE` que son exactamente lo que hay que verificar (#11).

Lo que sí queda en pie —mantener el SQL fuera de la lógica— se consigue con **un módulo por
agregado** cuyas funciones reciben `db`. Se lee como un repositorio; lo único que falta es la
`interface`, y extraerla el día que exista una segunda implementación es mecánico.

### Dónde acaba el código que ya existe

El commit `d1e4efd` es previo a esta decisión, así que se recoloca:

| Hoy | Va a | Por qué |
|---|---|---|
| `db.ts` (esquema, migración) | `infrastructure/persistence/db.ts` | Es acceso a datos, no lógica |
| `db.ts` → `ensureAccount()` | `infrastructure/persistence/accounts.ts` | Un módulo por agregado |
| `ingest.ts` → recorrido por offsets | `application/ingestUsage.ts` | Sirve para cualquier provider |
| `ingest.ts` → escritura de offsets | `infrastructure/persistence/ingestOffsets.ts` | SQL fuera de la lógica |
| `ingest.ts` → `parseUsageLine()` | `infrastructure/providers/anthropic/` | **El formato JSONL y la trampa del `message.id` son de Claude, no del dominio** |
| `config.ts` | se queda en la raíz | Configuración de proceso, no capa |

Ese tercer movimiento es el que importa: la regla de deduplicar por `message.id` y no por `uuid` es
un detalle del transcript de Claude Code. Si vive en el núcleo, el día de Antigravity hay que sacarlo
de en medio; si vive en el adaptador desde ahora, no hay nada que mover.

### Qué protege cada carpeta

**`shared/` no puede tener build ni lógica.** Solo tipos y constantes puras. Es lo que permite
que el daemon lo importe como TypeScript directo *y* que Vite lo transpile sin ceremonia. En
cuanto ahí entra una función con dependencias de runtime, se rompen los dos lados a la vez.

**La ingesta del daemon va siempre en un proceso aparte (#98).** El daemon lanza el mismo binario
con `ingest` antes de cada muestra de cuota y con `ingest --rebuild` desde Ajustes
(`infrastructure/ingestProcess.ts`), con un único ejecutor (`ingestRunner.ts`) que garantiza una
sola ingesta a la vez. Una pasada sin nada nuevo cuesta ~60 ms, pero ponerse al día tras horas
apagado lee a ~20 ms/MB de CPU síncrona: dentro del daemon congelaría el bucle de eventos y
retrasaría el `200` del hook, que está en la ruta crítica de Claude Code. El proceso hijo lee los
JSONL **fuera** de la transacción y escribe dentro de una `BEGIN IMMEDIATE` corta, para no
intercalar cientos de escrituras con las del daemon. Descartados: un temporizador propio (dos
relojes, la muestra puede emparejarse con tokens viejos), dispararla desde los hooks (depende de
que estén instalados y el dashboard solo refresca con `quota`) y `fs.watch` recursivo (un evento
por línea escrita y límites de inotify).

**`providers/anthropic/` existe desde el primer día aunque solo haya un provider.** Es la costura
que `DESIGN.md` §6 exige para que Antigravity sea aditivo. Hoy `'anthropic'` está hardcodeado en
el SQL de `ingest.ts`; esta carpeta es el sitio donde eso se corrige. Si el provider vive disperso,
el día de Antigravity es una refactorización y no una carpeta nueva.

**`state/` separado porque es la única lógica pura del daemon.** Sin I/O, sin BD, sin red: entra
un `NormalizedHookEvent`, sale un `PetState`. Es lo más fácil de testear y lo que más se va a
tocar afinando el comportamiento de la mascota.

**`daemon/public/` sobrevive a la llegada de la SPA.** La página fea sin build es lo que se sirve
antes de que exista `apps/web`, y después sigue siendo el mejor sitio desde el que depurar cuando
la SPA no arranca. No se borra al construir el dashboard.

**`daemon/test/fixtures/` con JSONL reales.** El test que más importa —el del doble conteo—
necesita dos líneas de verdad que compartan `message.id`. Salen de transcripts propios, con el
contenido recortado: solo metadatos, la misma regla que rige la BD.

**Un solo `cli.ts` como entrypoint.** No es estética: es el prerrequisito de Node SEA (§6). Un
binario autocontenido necesita un punto de entrada único y sin dependencias de runtime.

## 8. Riesgos que añade el stack

| Riesgo | Mitigación |
|---|---|
| El webview de la mascota depende del daemon | Página de fallback empaquetada + reconexión SSE automática |
| Compilar Tauri en Linux necesita `libwebkit2gtk-4.1-dev` | No instalado en esta máquina: es un prerrequisito de la épica 6, no una sorpresa a mitad |
| El binario SEA pesa ~123 MB (node entero) | Aceptable para una app de escritorio; el job `sea` del CI verifica que arranca sin Node |
| Type-stripping nativo no hace type-checking | `tsc --noEmit` en CI: Node ejecuta los tipos, no los valida |
