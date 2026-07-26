# Amnis Copilot — Diseño

> **Principio rector:** saber el uso y hacer compañía, no ser un historial.

Amnis Copilot es una mascota de escritorio que refleja lo que hacen tus agentes de IA,
más un dashboard local del consumo de tus suscripciones. Las dos mitades no son features
separadas: **la mascota es la visualización ambiental de tu cuota**.

## 1. Arquitectura

Local-first puro. Sin nube, sin cuentas de usuario, sin auth. Nada sale de la máquina.

```
   Claude Code ──hook──┐
   Antigravity ──hook──┤  (fase 2)
                       ▼
              ┌─────────────────────┐
              │   amnis-daemon      │  Node, 127.0.0.1:PORT
              │  · recibe hooks     │
              │  · parsea JSONL     │
              │  · poll cuota 180s  │──► api.anthropic.com/api/oauth/usage
              │  · SQLite           │
              │  · sirve API + SSE  │
              └──────────┬──────────┘
                         │  HTTP + SSE
              ┌──────────┴──────────┐
              ▼                     ▼
        Dashboard web          Mascota (Tauri)
```

**Decisión: local-first (no nube).** Todas las fuentes de datos son estrictamente locales
(`~/.claude/projects/*.jsonl`, `~/.claude/.credentials.json`, hooks). Un backend en la nube
no puede leer nada de eso; necesitaría igualmente un agente local. La nube no ahorra el
componente local, se lo añade encima.

**Todo por HTTP con URL configurable**, nunca IPC propietario ni `localhost` hardcodeado,
para que exponerlo por túnel (Tailscale/Cloudflare) sea un día de trabajo el día que haga falta.

### Stack

> Las decisiones concretas de stack (frontend, tooling, empaquetado) y su porqué viven en
> [`STACK.md`](./STACK.md). Aquí solo lo que condiciona la arquitectura.

- **Monorepo TypeScript** con tipos compartidos entre daemon y clientes.
- **Daemon: Node 24, cero dependencias.** `node:sqlite` (nativo) y type-stripping nativo de
  TypeScript. Sin build step, sin `node_modules` en el camino crítico.
- **Mascota: Tauri v2** (~5-10 MB, ~40 MB RAM) en vez de Electron (~150 MB, ~200 MB RAM).
  "Ligera" tiene que ser verdad, no un adjetivo del README.
- **Dashboard: SPA** servida por el propio daemon.

### Ciclo de vida

**El daemon vive con la app de la mascota** (Tauri lo arranca como sidecar). Elegido por
simplicidad sobre el servicio de sistema.

Esto es seguro porque **los JSONL son la fuente de verdad y la BD es una caché derivada con
offsets**: al abrir la mascota, el daemon reingiere todo lo que Claude Code escribió mientras
estaba apagado. No se pierde uso, tokens, sesiones ni proyectos. Lo único irrecuperable es la
serie temporal del endpoint OAuth y el estado en vivo — y ninguna importa cuando no estás
mirando. Los hooks aportan **inmediatez, no datos exclusivos**.

Migrar a servicio de sistema (systemd user unit / launchd / tarea programada) es más adelante
cambiar quién lanza el proceso, nada más.

## 2. Datos de uso

**Doble vía, siempre en paralelo** (no solo como fallback):

| Vía | Da | No da |
|---|---|---|
| Endpoint OAuth | `%` autoritativo de las ventanas 5h/7d, `resets_at`, todos los dispositivos | Desglose por proyecto/modelo |
| Parseo local JSONL | Tokens por sesión/modelo/proyecto, coste, histórico | El `%` real; nada fuera de Claude Code |

**La divergencia entre ambas es dato en sí**: dice cuánto consumes fuera de Claude Code.
Si el endpoint cae, el dashboard degrada a la estimación local en vez de romperse.

### Endpoint OAuth (no documentado)

```http
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer <accessToken>
anthropic-beta: oauth-2025-04-20
User-Agent: claude-code/<version>
```

```jsonc
{ "five_hour": { "utilization": 0-100, "resets_at": "ISO8601" },
  "seven_day": { "utilization": 0-100, "resets_at": "ISO8601" },
  "seven_day_opus": null, "seven_day_sonnet": null,
  "extra_usage": { "is_enabled": false, "monthly_limit": null,
                   "used_credits": null, "utilization": null } }
```

- El `User-Agent` es **obligatorio**: sin él, 429 instantáneo y persistente.
- Intervalo seguro: **180 s**. El rate limit es por access token.
- Token en `~/.claude/.credentials.json` (`claudeAiOauth.{accessToken,refreshToken,expiresAt}`),
  Keychain en macOS, o `CLAUDE_CODE_OAUTH_TOKEN`.
- El access token caduca cada ~60 min → **refresh automático es MVP**, sin él parece un bug.
- **Aislado tras la abstracción `Provider`**: si un día devuelve 404, degrada, no rompe.

#### Amnis nunca escribe en el fichero de credenciales de Claude

`.credentials.json` es estado de **otra aplicación**. Amnis lo relee en cada poll —es barato— y
solo refresca si el token está caducado *y* el fichero no se ha actualizado por su cuenta. El
token resultante se guarda en `~/.amnis/`, jamás de vuelta en `~/.claude/`.

La regla es asimétrica a propósito: el peor fallo de Amnis debe ser quedarse sin dato, nunca
romperle el login a Claude Code. Un dashboard que te desloguea de la herramienta que mide es
un producto que se desinstala.

> ⚠️ **Riesgo asumido y sin resolver:** no sabemos si Anthropic rota el `refresh_token` al usarlo.
> Si lo rota, que Amnis refresque invalida el que tiene Claude Code. Mitigación: refrescar solo
> cuando de verdad haga falta (token caducado y fichero sin tocar), y si tras un refresh el
> siguiente `401` es persistente, dejar de refrescar y degradar a estimación local.

### La ventana de 5 horas es fija, no rodante

"Los tokens de las últimas 5 horas" **no es lo que mide Anthropic**. La ventana arranca con el
primer mensaje y se cierra 5 h después; el consumo no se desliza, se resetea de golpe. Sumar una
ventana rodante da un número que nunca coincide con el del endpoint.

- **Con endpoint:** el inicio es `resets_at − 5 h`. Autoritativo, sin inferencia.
- **Sin endpoint:** se infiere del último reset conocido en `quota_samples`, avanzando en saltos
  de 5 h hasta cubrir el momento actual. Si no hay ninguno (primera ejecución sin red), se toma
  el primer `usage_event` que deje un hueco de más de 5 h sin actividad.

### El techo del plan se calibra solo

`PLAN_WINDOW_TOKENS` (pro ≈44k, max_5x ≈88k, max_20x ≈220k) son aproximaciones, y **nada en el
sistema sabe qué plan tienes**: `accounts.plan` nace nulo y ninguna fuente lo dice.

No hace falta preguntarlo. **Cada muestra trae la respuesta**: el endpoint da el `%` real y el
parseo local da los tokens del mismo instante, así que `techo ≈ tokens / (utilization / 100)`.
Con unas cuantas muestras por encima de un uso mínimo, el techo se estima solo y mejora con el uso.

- Se persiste en `accounts.plan_window_tokens`, no en el código.
- Solo se calibra con muestras autoritativas y con `utilization` suficiente (por debajo del ~10%
  el cociente es ruido).
- `PLAN_WINDOW_TOKENS` queda como **valor inicial** hasta que haya calibración, no como verdad.

Es el mejor uso posible de la doble vía: las dos fuentes no solo se comparan, **una enseña a la otra**.

### Coste: equivalente de API, nunca "gastado"

En una tarifa plana el coste por token no existe. Lo que sí responde a una pregunta real —*¿me
compensa la suscripción?*— es **cuánto habría costado ese consumo pagando la API pública**.

Se muestra siempre etiquetado como *equivalente*, junto al precio del plan. Presentarlo como
dinero gastado sería mentir. La tabla de precios vive en `domain/cost.ts`, versionada y con fecha:
es un dato que envejece, y tiene que verse cuándo se actualizó por última vez.

### Parseo de JSONL — la trampa del doble conteo

Las entradas `type: "assistant"` traen `message.usage` completo. **Pero varias líneas comparten
el mismo `message.id` y repiten el mismo objeto `usage`** — una línea por bloque de contenido
(`thinking`, `tool_use`, `text`). Medido en datos reales: 23 de 53 entradas duplicadas.

> **Deduplicar por `message.id`, nunca por `uuid`.** Deduplicar por `uuid` dobla los tokens.

Campos por entrada: `uuid`, `sessionId`, `cwd`, `timestamp`, `gitBranch`, `version`,
`requestId`, `message.model`, `message.usage.{input_tokens, output_tokens,
cache_creation_input_tokens, cache_read_input_tokens, service_tier}`.

## 3. Almacenamiento

**Solo metadatos. Nunca prompts ni código.** Los JSONL contienen tu trabajo completo;
duplicarlo crea un fichero que si se filtra duele de verdad, y no sirve al objetivo
(uso y compañía, no historial).

**Eventos crudos + rollups derivados.** Filas de ~100 bytes: años de uso caben en decenas de MB,
y cualquier pregunta nueva se puede responder hacia atrás.

**La BD es reconstruible.** Se guarda por fichero el offset procesado. Si cambia el parseo:
borrar la BD y reingerir. Nada se pierde porque el dato original no es nuestro.

### Esquema

- `accounts(id, provider, label, plan)` — multi-cuenta desde el día uno aunque hoy haya una fila.
- `ingest_offsets(file_path, size, offset)` — ingesta incremental.
- `usage_events(...)` — un evento por `message.id`, con `UNIQUE(dedupe_key)`.
- `hook_events(...)` — evento crudo del hook + estado derivado.
- `quota_samples(...)` — serie temporal: `%` del endpoint **y** estimación local del mismo instante.

## 4. La mascota

**Espejo de estado, no Tamagotchi con vida propia.** No tiene hambre por su cuenta: si te
reclamara atención por razones ajenas a tu trabajo, sería ruido con carita, y es lo que hace
que estas apps se cierren a las dos semanas.

Un único eje persistente: **fatiga = consumo de la ventana de 5h**. Fresca al 10%, agotada al
85%, revive en el reset. Ese es el enganche: la mascota y el dashboard son el mismo producto.
No hay simulación que balancear ni que pueda tener bugs — es un mapeo directo de un número
que ya calculas.

### Panel de cuota en la ventana flotante

La fatiga da el vistazo ambiental, pero no responde "¿me queda para terminar esto?". **Un click
en el bicho despliega un panel con las cifras**, y la preferencia se recuerda: quien quiera solo
compañía la tiene, quien quiera el número lo tiene sin abrir el navegador.

Plegado por defecto. El panel es **una lista indexada por proveedor** que hoy pinta una sola fila
(Claude), por la misma razón que `account_id` existe desde el día uno: es barato en la estructura
y caro como refactorización.

Por proveedor: ventana de 5h y de 7d, cada una con su barra y su cuenta atrás hasta `resets_at`.
**Cuando el dato no es autoritativo tiene que verse que no lo es** — un `~` y la etiqueta de
estimado, nunca un número inventado presentado como real.

No entra la divergencia: es análisis, y el análisis vive en el dashboard. La ventana flotante
responde de un vistazo o no sirve.

### Máquina de estados

Derivada de **eventos, no de heurísticas sobre texto**. Vive en el daemon; la mascota solo
renderiza lo que recibe por SSE, lo que la mantiene tonta y ligera.

| Evento | Estado |
|---|---|
| `PreToolUse` con `Edit`/`Write`/`NotebookEdit` | `coding` |
| `PreToolUse` con `Bash` matcheando `test\|pytest\|jest\|vitest\|cargo test` | `testing` |
| `PreToolUse` con `Read`/`Grep`/`Glob`/`WebSearch`/`WebFetch` | `researching` |
| `ExitPlanMode`/`EnterPlanMode`, o `permissionMode: plan` | `planning` |
| `Notification` (pide permiso) | `waiting` |
| `Stop` | `resting` |
| Sin eventos > N min | `sleeping` |

### Renderizado

El componente `<Pet>` recibe `{ state, level, fatigue }` y **no sabe nada de sprites**.
CSS/SVG procedural en el MVP; sprites o Lottie después cambiando solo ese componente.
La máquina de estados nunca sabe de gráficos. El arte es lo que más tarda y no depende de tu
habilidad como desarrollador: que la versión fea funcione primero.

### XP (fase 2)

Híbrido, **cosmético y monotónico** — nunca baja (si baja, es ansiedad) y nunca desbloquea
funcionalidad (si la desbloquea, es una app que te esconde features).

- **Hábito, sin tope:** días activos, rachas, sesiones completadas (llegar a `Stop`).
- **Volumen, con tope diario y curva logarítmica:** las primeras sesiones del día dan XP
  notable, la décima migajas.

El tope es deliberado: si la XP subiera con tokens consumidos, la mascota premiaría quemar
cuota, que es lo contrario de lo que el dashboard existe para ayudarte a controlar.

> **El nivel es tu historia, la fatiga es tu hoy.**

## 5. Hooks

Patrón validado por Orca, que ya vive en `~/.claude/settings.json` y `~/.gemini/config/hooks.json`:
POST a `127.0.0.1:PORT` con timeouts agresivos (0.5 s conexión, 1.5 s total), guardas en cada
variable de entorno, `|| true` y `exit 0` **siempre**. Pase lo que pase, nunca bloquea al agente.

`PreToolUse` con matcher `*` dispara muchísimo → fire-and-forget obligatorio, o hay lag en cada
llamada a herramienta.

**Cada entrada de Amnis se marca**, porque desinstalar limpio exige reconocer lo propio sin
adivinar. La marca es el propio comando: todo hook de Amnis invoca un script cuya ruta contiene
`amnis-hook`, y ese es el criterio de identidad — no un comentario JSON (que se pierde al
reescribir el fichero con cualquier herramienta) ni la posición en el array (que cambia).

`amnis install-hooks` hace **merge no destructivo** (los hooks son arrays y Orca ya está ahí);
`amnis uninstall-hooks` quita exactamente lo suyo. Nunca pedir al usuario que copie JSON a mano:
es la primera fricción y donde se abandona.

## 6. Alcance

**MVP: solo Claude Code, solo la cuenta activa.** Pero con `Provider` y `account_id` en el
esquema desde la primera línea, para que lo demás sea aditivo, no una refactorización.

| Dentro del MVP | Fuera (fase 2+) |
|---|---|
| Daemon + SQLite + ingesta con offsets | Sistema de XP y niveles |
| `install-hooks` con merge no destructivo | Antigravity |
| Máquina de estados + SSE | Multi-cuenta (OAuth propio) |
| Poll OAuth 180 s + estimación local + refresh de token | Tail de JSONL (herramientas sin hooks) |
| Mascota Tauri (estado + fatiga) | Sprites / arte definitivo |
| Dashboard (5h/7d en vivo, tokens y coste por día/proyecto/modelo) | Instaladores y empaquetado |
| `amnis doctor` | Túnel remoto |

### Por qué solo Claude en el MVP

El esfuerzo es asimétrico. Claude Code está regalado: JSONL legible, `usage` completo, hooks
documentados con nombre de herramienta, endpoint OAuth servido en bandeja. Antigravity son
`.pb` (protobuf) y `.db` (SQLite) sin esquema público, cuota vía language server local por
loopback o un flujo OAuth de Google completo — probablemente el 60-70% del esfuerzo total.
Y sus hooks (`PreInvocation`/`PostInvocation`/`Stop`) no dicen qué herramienta se usó, así que
aun haciendo el trabajo la mascota se comportaría **peor** con Antigravity que con Claude.

Interfaz `Provider`: `ingestHistorical()`, `pollQuota()`, `normalizeHookEvent()`.

### Multi-cuenta

`~/.claude/.credentials.json` guarda **una sola** sesión, y los JSONL no están etiquetados por
cuenta. Sin token de la cuenta B no hay `%` de la cuenta B. MVP = cuenta activa; el esquema ya
es multi-cuenta porque es barato en el esquema y caro en el auth.

## 7. Riesgos asumidos

| Riesgo | Mitigación |
|---|---|
| El endpoint OAuth no está documentado ni soportado | Aislado tras `Provider`; degrada a estimación local |
| `PreToolUse` `*` dispara muchísimo | Fire-and-forget, timeout corto, `exit 0` siempre |
| El access token caduca cada ~60 min | Refresh automático dentro del MVP |
| Wayland no soporta bien la ventana flotante | Modo degradado (ventana normal / bandeja) |
| Fallo silencioso del daemon | La mascota muestra "desconectada"; `amnis doctor` |
| Compilar Tauri en Linux | Requiere el paquete de desarrollo `webkit2gtk-4.1` |

## 8. Orden de construcción

**Primero, una rebanada vertical fea:** hook → daemon → SQLite → `GET /state` → HTML sin estilo.
Valida de golpe las tres suposiciones que pueden hundir el proyecto (latencia de hooks, endpoint
OAuth con tu token, parseo de JSONL) antes de escribir una línea de UI bonita.

**No empezar por la mascota.** Es la parte divertida y la más fácil de reescribir; empezando ahí
acabas con un bicho precioso conectado a datos falsos.
