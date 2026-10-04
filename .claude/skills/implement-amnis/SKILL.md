---
name: implement-amnis
description: Implementa una issue del backlog de Amnis de principio a fin — abre un worktree propio, asigna la issue y sus issues superiores, planifica, implementa, verifica, integra en main, hace push, cierra la issue y cierra las superiores que queden completas. Usar cuando el usuario pida implementar/empezar la issue #N.
argument-hint: <número de issue>
---

# /implement-amnis

Flujo completo para una issue del backlog. Invocar la skill con un número de issue autoriza
crear y borrar su worktree, commit, `git push` a `main` y cerrar la issue (y las superiores que
queden completas). Nada más sale de la máquina sin que el usuario lo pida.

El argumento es el número de la issue (`/implement-amnis 80`). Sin él, pedirlo.

Los pasos mecánicos viven en `.claude/scripts/` (cada uno explica su uso en la cabecera). Los
scripts no deciden nada que pida criterio: ante algo inesperado se paran con un mensaje `✗` y
no tocan nada. **Un `✗` no se esquiva repitiendo a mano lo que el script se negó a hacer**: se
lee, se entiende y, si no está claro qué hacer, se pregunta al usuario.

## 0. Abrir un worktree (antes de nada)

Varias sesiones pueden trabajar a la vez sobre este repo; en un solo árbol se pisan los ficheros
y los commits se llevan por delante los cambios a medias de la otra (pasó con #87 y #93). Cada
issue vive en su propio worktree desde el primer comando, **antes** de leer nada o tocar ficheros:

```bash
gh issue view N --json title -q .title      # solo para la descripción de la rama
.claude/scripts/worktree.sh --open N <descripcion>
```

La rama se llama **`N-<descripcion>`**: la descripción son de 2 a 5 palabras sacadas del título,
en minúsculas, sin tildes y con guiones (`87-rutas-de-actividad`, no
`87-9.8-rutas-de-actividad-sobre-hook-events`). En lo que sigue `<rama>` es ese nombre.

- Si el script se niega porque `../amnis-copilot-N` o una rama `N-*` ya existen, son de otra
  sesión o de un intento anterior: **no pisarlos**; enseñar al usuario lo que lista y preguntar.
- Desde aquí, todo en el worktree (la ruta absoluta que imprime `worktree.sh --open`, hermana
  del árbol principal): rutas absolutas de `Edit`/`Write` incluidas, nunca al árbol principal. El
  shell puede volver al árbol principal entre llamadas, así que cada comando del worktree empieza
  por `cd <ruta del worktree> &&`.
- Si el paso 1 encuentra un bloqueo y se para aquí, cerrar el worktree (§5, limpieza).

## 1. Leer y comprobar la jerarquía

```bash
gh issue view N
.claude/scripts/issue-tree.sh N
```

`issue-tree.sh` muestra los `blocked by`, las issues a las que N bloquea y la cadena de ancestros
(tarea → seguimiento → épica) con el estado de las hijas de cada uno. La jerarquía vive en
sub-issues nativos de GitHub, nunca en el cuerpo (`docs/CONVENCIONES.md`).

- Si sale con código 2 (algún `blocked by` sigue abierto), **parar** y decírselo al usuario; no
  se implementa saltándose un bloqueo.

## 2. Asignar

Asignar al usuario la issue **y todas sus issues superiores** (idempotente):

```bash
.claude/scripts/assign-chain.sh N
```

## 3. Plan Mode (obligatorio)

Antes de tocar ficheros: `EnterPlanMode`, explorar el código, diseñar el approach y dejarlo por
escrito para aprobación (`ExitPlanMode`). Ninguna issue se implementa sin este paso. El plan
debe cubrir el **"Hecho cuando"** de la issue (es lo que se verificará al final) y los `⚠️` del
cuerpo.

## 4. Implementar y verificar

- Seguir las convenciones del `CLAUDE.md` (capas, naming, comentarios en español).
- `.claude/scripts/check.sh` (typecheck, lint y tests) en verde. Si algo falla y no es de este
  cambio, decirlo con la salida; no taparlo.
- Verificar el **"Hecho cuando"** tal como está escrito, en la app real (navegador, daemon,
  CLI…), no solo con tests. Si la verificación toca servicios externos (p. ej. el daemon real
  sondea la API de Anthropic), preferir una alternativa local.
- Un daemon lanzado para verificar escucha en `4747`, que puede estar ocupado por otra sesión:
  lanzarlo con `AMNIS_PORT=$(.claude/scripts/free-port.sh)`.
- Limpiar procesos y pestañas que se hayan abierto para verificar.

## 5. Commit, push y cerrar la issue

Se commitea en `<rama>` y se integra en `main` sin PR (único contribuyente: la rama aísla el
trabajo en curso, no pide revisión). Mensaje `[#N] - Descripción en español`,
imperativo, con cuerpo si el porqué no es obvio.

```bash
git add -A && git commit                    # en el worktree: solo hay cambios de esta issue
.claude/scripts/integrate.sh                # rebase, check.sh si hace falta, push a main
gh issue close N -c "Implementado en <sha corto>."    # el SHA es la última línea de integrate.sh
```

- Si `integrate.sh` se para por conflictos, el rebase queda en curso: resolverlos en el worktree
  (skill `resolving-merge-conflicts`), nunca en el árbol principal, y relanzarlo.
- Si se para porque el push se rechazó (`main` avanzó), relanzarlo; nada de `--force`.
- Si `check.sh` falla tras el rebase, el fallo viene de combinar con commits ajenos: arreglarlo
  en un commit nuevo y relanzar.

**Limpieza obligatoria.** En cuanto el push a `main` ha entrado, borrar el worktree y su rama.
Es parte de integrar, no un extra: un worktree olvidado es justo el solape que este paso evita.
También se hace si se paró en §1 por un bloqueo. Antes, cerrar los procesos (daemon de
verificación, `pnpm dev`) y pestañas abiertos desde el worktree (§4).

```bash
cd <árbol principal> && .claude/scripts/worktree.sh --close N
```

- Se lanza desde el árbol principal: desde dentro del worktree se niega.
- Si dice que la rama tiene commits fuera de `origin/main`, el push no entró: no se borra nada;
  volver a §5.
- Si el worktree tiene cambios sin commitear, se niega a borrarlo: mirarlos antes, nunca forzar.

## 6. Revisar las issues superiores (no saltarse)

```bash
.claude/scripts/issue-tree.sh N
```

Subir por los ancestros que lista, del más cercano a la épica:

- Quedan hijas abiertas → el ancestro **sigue abierto**; anotar cuáles faltan.
- Todas cerradas → leer el **"Hecho cuando"** del ancestro (en seguimientos y épicas es un
  resultado de producto). Si se puede comprobar, comprobarlo y cerrarla con un comentario que
  lo diga; si no, **no cerrarla** y preguntar al usuario. Después, seguir con su propio padre.
- Mirar también las issues que bloqueaba N («Bloquea a»): ahora pueden estar listas;
  mencionarlas.

## 7. Informe final

Qué se hizo, qué se verificó y cómo, y el estado de la cadena (p. ej. «#80 cerrada · #76 sigue
abierta, falta #81 · #75 abierta»). Lo que no se cubrió o se dejó fuera de alcance, dicho
explícitamente. Decir también que el worktree y `<rama>` están borrados (la lista final de
`worktree.sh --close`).
