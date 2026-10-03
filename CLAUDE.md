# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

Monorepo pnpm. Todos los scripts se lanzan desde la raíz.

```bash
pnpm typecheck          # tsc --noEmit (daemon) + tsc --noEmit -p apps/web
pnpm lint                # biome check .
pnpm format              # biome check --write .
pnpm test                 # node --test packages/daemon/test/ + vitest run en apps/web
pnpm dev / pnpm build     # delega en cada paquete (pnpm -r --parallel <script>)
```

Un solo test file: `node --test packages/daemon/test/<archivo>.test.ts`.

El daemon corre sin build — Node 24 ejecuta TypeScript directo vía type-stripping:

```bash
node packages/daemon/src/<archivo>.ts
```

**`tsc --noEmit` no es opcional.** El type-stripping de Node borra las anotaciones sin
comprobarlas: sin `pnpm typecheck` el proyecto tiene autocompletado, no validación de tipos.

## Arquitectura

Amnis Copilot es una mascota de escritorio que refleja el estado de agentes de IA (Claude Code
hoy, Antigravity en fase 2) más un dashboard local de consumo de cuota. Local-first puro: sin
nube ni auth propia; solo salen llamadas a las APIs que integras (Anthropic; Spotify y
ReccoBeats desde E8), nunca transcripts. Diseño completo en
[`docs/DESIGN.md`](docs/DESIGN.md); decisiones de stack y su porqué en
[`docs/STACK.md`](docs/STACK.md).

```
Claude Code ──hook──► amnis-daemon (Node, 127.0.0.1:PORT)
                         · parsea JSONL de ~/.claude/projects/
                         · poll cuota cada 180s → api.anthropic.com/api/oauth/usage
                         · SQLite (caché derivada, reconstruible)
                         · sirve API HTTP + SSE
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
        Dashboard web          Mascota (Tauri)
```

### Doble vía de datos de uso, siempre en paralelo

No es fallback: la **divergencia** entre las dos fuentes es dato en sí (cuánto se consume fuera
de Claude Code).

- **Endpoint OAuth** (`GET api.anthropic.com/api/oauth/usage`) — `%` autoritativo de las ventanas
  5h/7d y `resets_at`. Requiere `User-Agent` o 429 instantáneo; rate limit por access token, 180s
  seguro. Token en `~/.claude/.credentials.json`, refresco automático, **nunca se escribe de
  vuelta en `~/.claude/`** — Amnis solo lee estado de otra aplicación.
- **Parseo local de JSONL** — tokens por sesión/modelo/proyecto reconstruidos de los transcripts.
  Siempre disponible, sin el `%` real.

### La trampa del doble conteo en el parseo de JSONL

Varias líneas de un transcript comparten el mismo `message.id` y **repiten el mismo objeto
`usage`** (una línea por bloque de contenido: `thinking`, `tool_use`, `text`). **Deduplicar por
`message.id`, nunca por `uuid`** — deduplicar por `uuid` dobla los tokens (medido: 23 de 53
entradas duplicadas en un fichero real). Esto vive en `parseUsageLine()`
(`packages/daemon/src/ingest.ts`) y en el `UNIQUE(dedupe_key)` del esquema (`db.ts`).

### SQLite es caché derivada, no fuente de verdad

Los JSONL de Claude Code son la fuente de verdad. La BD guarda offset por fichero para ingesta
incremental; si cambia el parseo, se borra la BD y se reingiere todo sin pérdida de datos
(`amnis ingest --rebuild`). Solo metadatos — nunca prompts ni código de los transcripts.

### Capas: domain / application / infrastructure (destino, en migración)

Regla de dependencias: `domain/` no importa nada del proyecto · `application/` importa
`domain/` · `infrastructure/` importa las dos. Sin `ports/`/`adapters/`: los nombres de capa ya
dicen quién define el contrato y quién lo implementa.

Un solo contrato en todo el proyecto, `domain/Provider.ts` (`ingestHistorical`, `pollQuota`,
`normalizeHookEvent`), porque es el único punto con una segunda implementación prevista
(Antigravity). La regla para crear una interfaz nueva: ¿hay una segunda implementación prevista?
Si no, función directa, no interfaz especulativa.

`infrastructure/http/` y `infrastructure/cli/` son **hermanos**, no uno colgando del otro: el
servidor HTTP y el CLI (`amnis ingest`, `amnis doctor`) entran por dos puertas al mismo código en
`application/`.

### Máquina de estados de la mascota

Derivada de eventos de hook, no de heurísticas sobre texto. Vive enteramente en el daemon; la
mascota (`<Pet>`) solo renderiza `{state, level, fatigue}` recibido por SSE — no sabe de sprites
ni de dónde sale el dato. Único eje persistente: fatiga = consumo de la ventana de 5h.

### Paquetes

- `packages/shared/src/types.ts` — contrato de tipos entre daemon y clientes (`PetSnapshot`,
  `QuotaSnapshot`, `StateResponse`, `NormalizedHookEvent`). Cambios aquí afectan a todo lo que
  consume el daemon.
- `packages/daemon/` — cero dependencias en runtime. `node:sqlite` y type-stripping nativos.

## Convenciones del backlog

Las issues de GitHub llevan siempre un **"Por qué"** (la razón de diseño, no solo la tarea) y un
**"Hecho cuando"** observable y capaz de fallar. Jerarquía y bloqueos van en sub-issues y
`blocked by` nativos de GitHub, nunca en el cuerpo (`docs/CONVENCIONES.md`):

```bash
gh api repos/:owner/:repo/issues/N/dependencies/blocked_by -q '.[].number'
gh api repos/:owner/:repo/issues/N/sub_issues -q '.[].number'
```

## Git

Único contribuyente del repo, pero varias sesiones de Claude Code pueden trabajar a la vez. Cada
issue se implementa en su propio worktree (`../amnis-copilot-N`) y en una rama de feature
`N-descripcion` (p. ej. `87-rutas-de-actividad`), que nace de `origin/main`, se rebasa sobre ella
y se integra con `git push origin HEAD:main`. Sin PRs. Al integrar se borran el worktree y la
rama; el árbol principal no se usa para editar. El flujo completo está en
`.claude/skills/implement-amnis/SKILL.md`.

## Flujo de trabajo por issue

Antes de implementar una issue del backlog, pasar por **Plan Mode**: explorar el código
relevante, diseñar el approach y dejarlo por escrito para aprobación antes de tocar ficheros.
Ninguna issue se implementa directamente sin ese paso previo.

## Mensajes de commit

Formato: `[#issue] - Descripción en español`, imperativo, con el cuerpo explicando el porqué
cuando no sea obvio. Ejemplo: `[#7] - Añade tsconfig, Biome y scripts del workspace`.
