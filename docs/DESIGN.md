# Amnis Copilot — Diseño

> **Principio rector:** saber el uso y hacer compañía, no ser un historial.

Amnis Copilot es una mascota de escritorio que refleja lo que hacen tus agentes de IA,
más un dashboard local del consumo de tus suscripciones. Las dos mitades no son features
separadas: **la mascota es la visualización ambiental de tu cuota**.

## 1. Arquitectura

Local-first puro. Sin nube propia, sin cuentas de usuario, sin auth propia. Lo único que sale de
la máquina son las llamadas a las APIs de los servicios que integras, con tus propias credenciales,
y nunca tus transcripts: la cuota a Anthropic y, desde E8, la reproducción a Spotify y el ID de
la canción que suena a ReccoBeats (§6).

```
   Claude Code ──hook──┐
   Antigravity ──hook──┤  (fase 2)
                       ▼
              ┌─────────────────────┐
              │   amnis-daemon      │  Node, 127.0.0.1:PORT
              │  · recibe hooks     │
              │  · parsea JSONL     │
              │  · poll cuota 180s  │──► api.anthropic.com/api/oauth/usage
              │  · poll reproducción│──► api.spotify.com (E8)
              │  · vibe por canción │──► ReccoBeats (E8)
              │  · SQLite           │
              │  · sirve API + SSE  │
              └──────────┬──────────┘
                         │  HTTP + SSE
              ┌──────────┴──────────┐
              ▼                     ▼
        Dashboard web          Mascota (Tauri)
```

**Decisión: local-first (no nube).** Todas las fuentes de datos son estrictamente locales
(`~/.claude/projects/**/*.jsonl`, `~/.claude/.credentials.json`, hooks). Un backend en la nube
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

Esto es seguro porque **los JSONL son la fuente de verdad del uso y la BD lo guarda como caché
derivada con offsets**: al arrancar, el daemon ingiere todo lo que Claude Code escribió mientras
estaba apagado, y vuelve a ingerir justo antes de cada muestra de cuota (cada 180 s y al pedir
una recarga; ver «El techo del plan se calibra solo»). Nadie tiene que ejecutar `amnis ingest`.
No se pierde uso, tokens, sesiones ni proyectos. Lo irrecuperable es la
serie temporal del endpoint OAuth, los eventos de hook y el estado en vivo: **solo existen si el
daemon estaba escuchando**. Al abrir la mascota no se pierde nada de lo que ya estaba guardado
(el uso se reingiere; lo demás se conserva), pero lo ocurrido con el daemon apagado no se puede
recuperar de ninguna fuente. Hasta E9 eso se aceptaba («ninguna importa cuando no estás mirando»);
con el pico diario de Histórico (`quota_samples`) y la vista de Actividad (`hook_events`) sí
importan, por eso `--rebuild` no los toca (§3). Los hooks aportan **inmediatez, no datos
exclusivos del uso**.

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
  "limits": [
    { "kind": "session",    "group": "session", "percent": 64, "severity": "normal",
      "resets_at": "ISO8601", "scope": null, "is_active": true },
    { "kind": "weekly_all", "group": "weekly",  "percent": 38, "severity": "normal",
      "resets_at": "ISO8601", "scope": null, "is_active": false }
  ],
  "seven_day_breakdown": { "as_of": "ISO8601", "window_started_at": "ISO8601",
    "rows": [ { "key": "claude_code", "display_name": "Claude Code", "percent": 100 },
              { "key": "chat", "display_name": "Chats", "percent": 0 } ] },
  "extra_usage": { "is_enabled": false, "monthly_limit": null,
                   "used_credits": null, "utilization": null } }
```

- **`limits[]` es la fuente de los límites**: son los que tiene *esa* cuenta. Un límite propio de
  un modelo aparece ahí con su `scope`; una cuenta sin él no ve nada. No se cablean modelos
  (`seven_day_opus` ha sido `null` en las 881 muestras de esta cuenta).
- `kind`, `scope` y `severity` son abiertos: un valor desconocido sale con etiqueta genérica
  (`<kind> · <scope>`), nunca se descarta. Conocidos: `session` (5h) y `weekly_all` (7d).
- Si `limits[]` no viene, el parser cae a `five_hour`, `seven_day` y las claves `seven_day_<x>`
  con ventana válida (`seven_day_sonnet` incluida).
- La respuesta trae además una docena de claves con nombre en clave (`iguana_necktie`,
  `tangelo`…), casi todas `null`. Son internas de Anthropic y cambian sin aviso: se ignoran.
- **`seven_day_breakdown`** reparte el consumo de la ventana de 7 d por origen (Claude Code,
  Chats, Cowork, Other). Responde directamente a «¿cuánto consumo fuera de Claude Code?»
  para 7 d; **no sustituye** a la divergencia, que sigue siendo la única respuesta para 5 h.
  Un `key` desconocido se conserva con su `display_name`. No se persiste: es un dato del
  momento y viaja con cada muestra por SSE. Anthropic no documenta cómo atribuye cada
  petición a un origen, por eso se validó empíricamente (#83): tras chatear en claude.ai fuera de
  Claude Code, `Chats` subió de 0 a 1 y `Claude Code` bajó de 100 a 99, en la misma medida.
  Los porcentajes son enteros sobre toda la semana: un rato corto de chat no mueve ninguno.
- `quota_samples.limits_json` guarda la lista de cada muestra; `opus_util` se conserva por
  compatibilidad y las filas nuevas la dejan en `NULL`.

- El `User-Agent` es **obligatorio**: sin él, 429 instantáneo y persistente.
- Intervalo seguro: **180 s**. El rate limit es por access token.
- Token en `~/.claude/.credentials.json` (`claudeAiOauth.{accessToken,expiresAt}`), Keychain en
  macOS, o `CLAUDE_CODE_OAUTH_TOKEN`.
- El access token caduca y **Amnis no lo refresca** (#136): Claude Code lo renueva al usarse, y
  mientras está caducado no se consulta el endpoint y el `%` cae a la estimación local.
- **Aislado tras la abstracción `Provider`**: si un día devuelve 404, degrada, no rompe.

#### Amnis solo lee las credenciales de Claude, nunca las renueva

`.credentials.json` es estado de **otra aplicación**. Amnis lo relee en cada poll —es barato— y
usa el access token tal cual; si ha caducado, espera a que Claude Code lo renueve.

Hasta #136 Amnis refrescaba el token por su cuenta. Se quitó por dos motivos: exigía el client
ID de Claude Code y acuñar tokens de la suscripción desde una aplicación ajena, y si Anthropic
rota el `refresh_token` al usarlo, el refresco de Amnis invalidaba el de Claude Code y le cerraba
la sesión. El peor fallo de Amnis debe ser quedarse sin dato, nunca romperle el login a Claude
Code: un dashboard que te desloguea de la herramienta que mide es un producto que se desinstala.

El coste: tras un rato sin usar Claude Code no hay `%` real hasta volver a usarlo. Es un hueco
que ya cubre la estimación local, y coincide con cuando menos importa (no estás consumiendo).

### La ventana de 5 horas es fija, no rodante

"Los tokens de las últimas 5 horas" **no es lo que mide Anthropic**. La ventana arranca con el
primer mensaje y se cierra 5 h después; el consumo no se desliza, se resetea de golpe. Sumar una
ventana rodante da un número que nunca coincide con el del endpoint.

- **Con endpoint:** el inicio es `resets_at − 5 h`. Autoritativo, sin inferencia.
- **Sin endpoint:** se parte del último `resets_at` guardado en `quota_samples`, que es el
  **final** de una ventana, no un inicio:
  - Reset **futuro** → esa ventana sigue abierta y empezó en `reset − 5 h`.
  - Reset **pasado** → la ventana actual arranca en el primer `usage_event` posterior al reset
    (consulta por el índice de `ts`); si esa ventana ya se cerró, se repite con el primer evento
    posterior a su cierre, hasta dar con una que contenga el momento actual.
  - Reset pasado **sin ningún evento posterior** → no hay ventana activa: `windowStartedAt` es
    `null` y la estimación es 0 tokens. No se inventa una ventana.
  - **Sin ningún reset** conocido (primera ejecución sin red) → el primer `usage_event` que
    deje un hueco de más de 5 h sin actividad.

### Serie de cuota y proyección al reset (#85)

`quota_samples` guarda una muestra cada 180 s; el daemon la sirve:

- `GET /api/quota/history?from&to` → `{ samples: { at, fiveHour, sevenDay, local }[] }` (24 h por
  defecto): la sparkline de la ventana actual.
- `GET /api/quota/peaks?from&to` → `{ day, peak }[]` (7 días por defecto): el `MAX(five_hour_util)`
  por día (UTC, solo muestras con endpoint) de Histórico.
- `QuotaSnapshot.projection.fiveHourAtReset`: a qué `%` llegará la ventana de 5 h en su reset si
  sigue el ritmo de la última hora (`projectAtReset()`, `domain/pace.ts`, mínimos cuadrados). Se
  calcula dentro de la ventana fija, desde `resets_at − 5 h`, y se para en el reset.
- **Es `null`, no un número inventado**, con menos de 3 muestras, con menos de 10 min entre la
  primera y la última, con la última ya en el reset, o sin endpoint (misma regla que el `~` de lo
  estimado). Una pendiente negativa es ruido y se toma como 0. No se recorta a 100: pasarse es
  una señal real.

### El techo del plan se calibra solo

`PLAN_WINDOW_TOKENS` (pro ≈44k, max_5x ≈88k, max_20x ≈220k) son aproximaciones. **El plan sí se
sabe** (#84): `.credentials.json` trae `subscriptionType` (`"pro"`, `"max"`…) y `rateLimitTier`,
y `detectPlanId()` (`domain/plans.ts`) lo traduce a un plan de la tabla `PLANS`, con su precio
mensual y fecha como `cost.ts`. `rateLimitTier` solo distingue Max 5x de Max 20x (en una cuenta
Pro vale `default_claude_ai`, poco descriptivo): si no es concluyente se devuelve `null`, no se
adivina.

- **Lo detectado siempre gana a lo manual.** Si no, una elección antigua taparía un cambio real
  de plan.
- El selector manual (`plan` en `~/.amnis/settings.json`, aceptado por `PUT /api/settings`) es
  solo el respaldo para lo que no se puede leer: Keychain de macOS, `CLAUDE_CODE_OAUTH_TOKEN`, o
  un valor que la tabla no conoce (Team, Enterprise, un plan nuevo). Vive en el fichero de
  ajustes, nunca en la BD: `--rebuild` no puede llevarse un ajuste del usuario.
- `GET /api/state` expone `plan: { id, label, monthlyUsd, source: "detected" | "manual" } | null`.
- El plan resuelto da el **valor inicial** de `PLAN_WINDOW_TOKENS`; `accounts.plan` sigue sin usarse.

El techo, en cambio, **no hace falta preguntarlo**: el endpoint da el `%` real y el parseo local
los tokens del mismo instante, así que `techo ≈ tokens / (utilization / 100)`. Pero **no se
calibra con la última muestra** (#100): entonces cada muestra reescribiría el techo y `local_util`
sería una extrapolación de la lectura anterior, no una estimación independiente. Lo que se
consume en claude.ai o en el móvil subiría `util` sin subir `tokens` y se absorbería en el techo
siguiente en vez de verse como divergencia.

- **Mediana de ventanas cerradas.** `window_ceilings` guarda una fila por ventana (`plan`,
  `window_end`, `tokens`, `utilization`) con su última muestra válida: autoritativa, con la caché de
  uso al día y `utilization ≥ 30 %`. El techo es la mediana de `tokens / (utilization/100)` de las
  últimas 7 ventanas **cerradas** (`window_end ≤ ahora`) del plan vigente. La ventana en curso se
  registra, pero no entra hasta cerrarse: una muestra intermedia no mueve el techo.
- **Con menos de 3 ventanas** no hay techo robusto: vale `PLAN_WINDOW_TOKENS` del plan detectado
  como **valor inicial** y el snapshot lleva `local.calibrated = false`; la vista Ahora marca
  la estimación y la divergencia como orientativas.
- `resets_at` trae jitter de microsegundos (`15:50:00.030191`, `15:49:59.637`): `window_end` se
  redondea al minuto, o una misma ventana se partiría en filas distintas.
- **Cambiar de plan descarta el historial** (se filtra por `plan`): el de Pro no dice nada de Max.
- «Del mismo instante» lo hace cierto el daemon (#98): ingiere los JSONL nuevos **antes** de cada
  muestra. Una muestra cuya ingesta falló, o que coincidió con una reconstrucción, se guarda pero
  **no se registra**: con tokens parciales el cociente da un techo a la mitad (pasó el 2026-10-02: 37,6 M
  de tokens congelados entre un 98 % dieron 38,4 M, frente a una mediana de 75,4 M).
- **Limitación:** con dos fuentes no se puede separar la capacidad real de un uso externo
  **constante**. Si cada ventana lleva un 6 % de claude.ai, el techo sale un 6 % bajo. La mediana
  tolera ventanas sueltas con mucho uso externo, no uno constante. Se documenta, no se resuelve.
- `accounts.plan_window_tokens` queda sin uso (la columna se conserva para no migrar a la baja).

Es el mejor uso posible de la doble vía: las dos fuentes no solo se comparan, **una enseña a la otra**.

### Coste: equivalente de API, nunca "gastado"

En una tarifa plana el coste por token no existe. Lo que sí responde a una pregunta real —*¿me
compensa la suscripción?*— es **cuánto habría costado ese consumo pagando la API pública**.

Se muestra siempre etiquetado como *equivalente*, junto al precio del plan. Presentarlo como
dinero gastado sería mentir. Los precios son un dato que envejece con cada lanzamiento de modelo,
así que no se escriben a mano: el daemon descarga la página de precios oficial
(`platform.claude.com/docs/en/about-claude/pricing.md`; la Models API no expone precios) al
arrancar y cada 24 h, y la guarda en SQLite. La tabla de `domain/cost.ts` es solo la semilla para
un primer arranque sin red. Dos reglas:

- **Nunca se sustituye una tabla buena por una peor.** Si la página no responde o su formato no se
  reconoce (falta una columna, algún precio ilegible), se descarta entera y siguen valiendo los
  últimos precios buenos. Se hace upsert sin borrar: un modelo retirado de la página conserva su
  último precio.
- **Un modelo sin precio se ve.** Su coste cuenta 0, pero la API lo lista en `unpricedModels` y el
  dashboard lo nombra; si no, "no lo sé" pasaría por "barato". Junto al coste se muestra la fecha
  de la última descarga buena.

### Parseo de JSONL — la trampa del doble conteo

Las entradas `type: "assistant"` traen `message.usage` completo. **Pero varias líneas comparten
el mismo `message.id` y repiten el mismo objeto `usage`** — una línea por bloque de contenido
(`thinking`, `tool_use`, `text`). Medido en datos reales: 23 de 53 entradas duplicadas.

> **Deduplicar por `message.id`, nunca por `uuid`.** Deduplicar por `uuid` dobla los tokens.

Campos por entrada: `uuid`, `sessionId`, `cwd`, `timestamp`, `gitBranch`, `version`,
`requestId`, `message.model`, `message.usage.{input_tokens, output_tokens,
cache_creation_input_tokens, cache_read_input_tokens, service_tier}`.

**Los subagentes tienen su propio transcript.** Claude Code los guarda aparte, en
`<sesión>/subagents/agent-*.jsonl` (y los de workflows en `subagents/workflows/wf_*/`), con
llamadas que no están en el transcript padre (~15 % de los tokens, y todo el uso de Haiku). Por
eso la búsqueda es recursiva y solo se ingieren `.jsonl`: al lado hay `wf_*.json` que no son
transcripts. Si algún mensaje aparece en los dos sitios, la deduplicación por `message.id` lo
absorbe. Cuando entran tokens que antes no se contaban, el techo calibrado no se recalibra a mano:
se reajusta solo a medida que las ventanas nuevas sustituyen en la mediana a las anteriores.

## 3. Almacenamiento

**Solo metadatos. Nunca prompts ni código.** Los JSONL contienen tu trabajo completo;
duplicarlo crea un fichero que si se filtra duele de verdad, y no sirve al objetivo
(uso y compañía, no historial).

**Eventos crudos + rollups derivados.** Filas de ~100 bytes: años de uso caben en decenas de MB,
y cualquier pregunta nueva se puede responder hacia atrás.

**La BD es reconstruible solo en parte, y `--rebuild` nunca borra.** Se guarda por fichero el
offset procesado. Si cambia el parseo, `amnis ingest --rebuild` olvida los offsets y **reingiere
todos los JSONL que sigan en disco, actualizando** (`ON CONFLICT(dedupe_key) DO UPDATE`, solo con la primera aparición de cada
clave en la pasada, como una ingesta desde cero) lo que ya había. No borra nada, y la razón es medible: **Claude Code purga sus transcripts con el tiempo**
(en esta máquina el más antiguo es del 7 de septiembre, y la BD guarda uso desde junio), así que
para ese uso la BD es la única copia. Un `DELETE` + reingesta perdía 10.348 eventos.

| Tabla | Naturaleza | `--rebuild` |
|---|---|---|
| `usage_events` | Sale de los JSONL **mientras existan** | La corrige; conserva los de transcripts purgados |
| `ingest_offsets` | Derivada | La reinicia (releer todo) |
| `quota_samples`, `hook_events` | Solo existen porque el daemon escuchaba | No la toca |
| `window_ceilings` | Recalibrar exige ventanas cerradas con uso suficiente y tarda días | No la toca |
| `model_prices` | Se vuelve a descargar | No la toca |

Reinicio de offsets y reingesta van en **una transacción**: si la reingesta falla, no cambia nada.
Limitación asumida: si un cambio de parseo cambia las `dedupe_key`, las filas viejas no se
actualizan y quedarían duplicadas; ese caso exige borrar `~/.amnis/amnis.sqlite` a mano (y eso sí
pierde la serie de cuota y el uso de transcripts purgados).

### Esquema

- `accounts(id, provider, label, plan)` — multi-cuenta desde el día uno aunque hoy haya una fila.
- `ingest_offsets(file_path, size, offset)` — ingesta incremental.
- `usage_events(...)` — un evento por `message.id`, con `UNIQUE(dedupe_key)`.
- `hook_events(...)` — evento crudo del hook + estado derivado.
- `quota_samples(...)` — serie temporal: `%` del endpoint **y** estimación local del mismo instante.

### Actividad: tramos sobre `hook_events` (#87)

`GET /api/activity?day=` y `/api/activity/heatmap?weeks=` salen de `hook_events` sin guardar nada
nuevo (`domain/activity.ts`). Reglas que conviene no olvidar:

- **Tramos por sesión, nunca sobre la línea global**: dos terminales a la vez se solapan, así que
  la suma de `byState` puede superar el tiempo de reloj. Un tramo dura hasta el siguiente evento
  de su sesión, con tope en `SLEEP_AFTER_MS` desde el último; pasado el tope queda un hueco
  (`sleeping` no es un tramo), para que una sesión abandonada a mediodía no salga "trabajando"
  hasta medianoche.
- **Eventos `unknown`** (Skill, ToolSearch, MCP…): prueban que la sesión vive y alargan un tramo
  de trabajo, pero cierran `waiting` y `resting`: una herramienta nueva significa que ya
  respondiste. Sin `PostToolUse`, un `waiting` incluye lo que tarda en ejecutarse lo aceptado.
- **El día va en hora local del daemon**, a diferencia del uso (`date(ts)`, UTC): "ayer" y las
  horas del mapa de calor son las de quien mira. El mapa cuenta minutos de agente sin `resting`.
- Tokens, coste y rama por sesión salen de `usage_events.session_id` / `git_branch` (columna
  nueva, la rellena `--rebuild`).

## 4. La mascota

**Espejo de estado, no Tamagotchi con vida propia.** No tiene hambre por su cuenta: si te
reclamara atención por razones ajenas a tu trabajo, sería ruido con carita, y es lo que hace
que estas apps se cierren a las dos semanas.

Un único eje persistente: **fatiga = consumo de la ventana de 5h**. Fresca al 10%, agotada al
85%, revive en el reset. Ese es el enganche: la mascota y el dashboard son el mismo producto.
No hay simulación que balancear ni que pueda tener bugs — es un mapeo directo de un número
que ya calculas.

**La fatiga cambia cuánto y a qué ritmo se mueve la mascota, nunca su forma ni su color.** Marca
el tempo del cuerpo (ciclo de ~1 s fresca a ~2,6 s agotada) y la luz de la antena. Con música
(abajo), también amortigua la amplitud del cabeceo. Una mascota que se deforma o se apaga al
cansarse sería un Tamagotchi que castiga, no un espejo.

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
| `SessionStart` / `SessionEnd` | ninguno: se guardan con `source`/`reason`, `derived_state = 'unknown'` |
| Sin eventos > N min | `sleeping` |

**Con un foco fijado (E10), el estado es solo el de lo enfocado**, así que `sleeping` puede
significar "lo que miras está parado" aunque otra sesión trabaje. Para no perder eso, la mascota
lleva una insignia discreta **"+N"** (`othersActive`: las sesiones vivas fuera del foco; siempre 0
en `auto`). Es un número aparte, no mezcla los estados de las demás, y no cambia la forma ni el
color de la mascota. Viva es lo mismo que en la lista de sesiones: sin `SessionEnd` y con hooks
dentro de la ventana de inactividad.

**Con el foco en «Todas» (E14)** el snapshot lleva además `sessions`: una entrada por sesión
viva (`null` en cualquier otro foco), cada una con su `state`, `since`, `commitHash`, worktree y
un **color de identidad**. El daemon deriva el estado de cada una igual que con un foco `session`
y los clientes solo eligen cuál dibujar. Van por orden de llegada (`startedAt`), no de actividad,
para que la flecha derecha lleve siempre al mismo sitio. El color es el primer hueco libre de una
paleta fija entre las sesiones vivas, y la sesión lo conserva hasta que termina; un `/clear` crea
otro `session_id` en el mismo worktree y hereda puesto y color (el puesto se reserva unos
segundos, hasta que la conversación nueva da su primer hook). La cuota es de la cuenta: con la de
5 h agotada todas las entradas están en `limited`. El color dice *quién es* la sesión, no *cómo
está*: no contradice que la fatiga no toque forma ni color.

### Renderizado

El componente `<Pet>` recibe `{ state, level, fatigue }` (y desde E8, `listening` y las
preferencias de música) y **no sabe nada de sprites**.
CSS/SVG procedural en el MVP; sprites o Lottie después cambiando solo ese componente.
La máquina de estados nunca sabe de gráficos. El arte es lo que más tarda y no depende de tu
habilidad como desarrollador: que la versión fea funcione primero.

### Música (fase 2, E8)

Cuando suena Spotify, la mascota lleva cascos. **`listening` es un segundo eje, ortogonal al
estado**: lo suma, nunca lo sustituye. `coding` con música es "teclea con auriculares". El estado
lo siguen decidiendo solo los agentes, y por eso **un evento de Spotify no es actividad**: no
reinicia el temporizador de `sleeping`. Si lo hiciera, poner música mantendría despierta a la
mascota sin agentes trabajando.

Cada entrada controla una sola cosa, así que no se pisan:

| Entrada | Controla |
|---|---|
| Vibe (energía × valencia de la canción) | el estilo: fiesta rebota, intensa sacude, chill flota, melancólica cae; podcast emite ondas |
| BPM | la velocidad de cascos, notas y cabeceo de la cabeza |
| Fatiga | la amplitud: agotada sigue el ritmo, con menos ganas |

**En `waiting` y `limited` la capa de música entera se apaga**, sin opción para cambiarlo: son
los estados que piden tu atención, y un permiso pendiente tiene que leerse sin nada encima.

Al cambiar de canción, la pantalla de la mascota (su cara) muestra unos segundos la portada y el
título. Todo lo visual de la capa es configurable desde el dashboard, con un interruptor general
para apagarla; los valores por defecto y su porqué están en la épica E8.

`<Pet>` sigue sin saber de dónde salen los datos: recibe `listening` y las preferencias como
props, igual que el estado y la fatiga.

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
| Poll OAuth 180 s + estimación local | Tail de JSONL (herramientas sin hooks) |
| Mascota Tauri (estado + fatiga) | Sprites / arte definitivo |
| Dashboard (5h/7d en vivo, tokens y coste por día/proyecto/modelo) | Instaladores y empaquetado |
| `amnis doctor` | Túnel remoto |
| | Integración con Spotify (E8) |

### Por qué solo Claude en el MVP

El esfuerzo es asimétrico. Claude Code está regalado: JSONL legible, `usage` completo, hooks
documentados con nombre de herramienta, endpoint OAuth servido en bandeja. Antigravity son
`.pb` (protobuf) y `.db` (SQLite) sin esquema público, cuota vía language server local por
loopback o un flujo OAuth de Google completo — probablemente el 60-70% del esfuerzo total.
Y sus hooks (`PreInvocation`/`PostInvocation`/`Stop`) no dicen qué herramienta se usó, así que
aun haciendo el trabajo la mascota se comportaría **peor** con Antigravity que con Claude.

Interfaz `Provider`: `ingestHistorical()`, `pollQuota()`, `normalizeHookEvent()`.

### Spotify (E8)

**Primera ampliación más allá de "espejo de tus agentes"**: ver y controlar la música desde la
mascota y el dashboard. Se rige por tres decisiones:

- **Web API, no MPRIS.** MPRIS sería local y sin OAuth, pero solo alcanza al cliente de escritorio
  de este PC; el valor está en controlar móvil y altavoces vía Spotify Connect. El precio, asumido:
  Premium obligatorio para el dueño de la app en modo desarrollo, **un Client ID por usuario**
  (cada uno registra su app; Amnis no puede distribuir uno compartido), OAuth con PKCE y polling,
  porque la Web API no tiene push.
- **Nada de Spotify se persiste.** El estado vive en memoria y viaja por SSE.
- **La vibe y el BPM vienen de ReccoBeats**, porque Spotify retiró `audio-features` en noviembre
  de 2024. Es un servicio de terceros no oficial y recibe el ID de cada canción que suena: si cae,
  la mascota usa su animación neutra, y nada más se rompe.

### Multi-cuenta

`~/.claude/.credentials.json` guarda **una sola** sesión, y los JSONL no están etiquetados por
cuenta. Sin token de la cuenta B no hay `%` de la cuenta B. MVP = cuenta activa; el esquema ya
es multi-cuenta porque es barato en el esquema y caro en el auth.

## 7. Riesgos asumidos

| Riesgo | Mitigación |
|---|---|
| El endpoint OAuth no está documentado ni soportado | Aislado tras `Provider`; degrada a estimación local |
| `PreToolUse` `*` dispara muchísimo | Fire-and-forget, timeout corto, `exit 0` siempre |
| El access token caduca | Claude Code lo renueva al usarse; mientras, estimación local (#136) |
| Wayland no soporta bien la ventana flotante | Modo degradado (ventana normal / bandeja) |
| Fallo silencioso del daemon | La mascota muestra "desconectada"; `amnis doctor` |
| Compilar Tauri en Linux | Requiere el paquete de desarrollo `webkit2gtk-4.1` |
| Spotify endurece otra vez el modo desarrollo de su API | Toda la integración aislada en E8; sin Spotify, Amnis sigue entero |
| ReccoBeats cambia o desaparece | Vibe `neutral` y animación neutra; la caché es solo en memoria |

## 8. Orden de construcción

**Primero, una rebanada vertical fea:** hook → daemon → SQLite → `GET /state` → HTML sin estilo.
Valida de golpe las tres suposiciones que pueden hundir el proyecto (latencia de hooks, endpoint
OAuth con tu token, parseo de JSONL) antes de escribir una línea de UI bonita.

**No empezar por la mascota.** Es la parte divertida y la más fácil de reescribir; empezando ahí
acabas con un bicho precioso conectado a datos falsos.
