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

## 0. Abrir un worktree (antes de nada)

Varias sesiones pueden trabajar a la vez sobre este repo; en un solo árbol se pisan los ficheros
y los commits se llevan por delante los cambios a medias de la otra (pasó con #87 y #93). Cada
issue vive en su propio worktree desde el primer comando, **antes** de leer nada o tocar ficheros:

```bash
gh issue view N --json title -q .title      # solo para el nombre de la rama
git fetch origin
git worktree add ../amnis-copilot-N -b N-descripcion origin/main
cd ../amnis-copilot-N && pnpm install --frozen-lockfile
```

La rama de feature se llama **`N-descripcion`**: el número de la issue y una descripción corta en
minúsculas, sin tildes y con guiones, de 2 a 5 palabras sacadas del título (`87-rutas-de-actividad`,
no `87-9.8-rutas-de-actividad-sobre-hook-events`). En lo que sigue `<rama>` es ese nombre.

- Si `../amnis-copilot-N` o una rama `N-*` ya existen, es de otra sesión o de un intento anterior:
  **no pisarlos**; mirar `git worktree list` y preguntar al usuario.
- Desde aquí, todo en ese directorio: rutas absolutas de `Edit`/`Write` incluidas (apuntan a
  `/home/termi/amnis-copilot-N/…`, nunca al árbol principal). El árbol principal no se toca.
- Una rama por issue, nacida de `origin/main` y de vida corta. El destino es `main` (§5).
- Si el paso 1 encuentra un bloqueo y se para aquí, quitar el worktree (§5, última parte).

## 1. Leer y comprobar la jerarquía

```bash
gh issue view N
gh api repos/:owner/:repo/issues/N/dependencies/blocked_by -q '.[].number'
gh api repos/:owner/:repo/issues/N/parent -q .number     # repetir hacia arriba hasta 404
```

- Si algún `blocked by` sigue abierto, **parar** y decírselo al usuario; no se implementa
  saltándose un bloqueo.
- Construir la cadena de ancestros (tarea → seguimiento → épica). La jerarquía vive en
  sub-issues nativos de GitHub, nunca en el cuerpo (`docs/CONVENCIONES.md`).

## 2. Asignar

Asignar al usuario la issue **y todas sus issues superiores** (idempotente):

```bash
gh issue edit N --add-assignee @me     # y lo mismo con cada ancestro
```

## 3. Plan Mode (obligatorio)

Antes de tocar ficheros: `EnterPlanMode`, explorar el código, diseñar el approach y dejarlo por
escrito para aprobación (`ExitPlanMode`). Ninguna issue se implementa sin este paso. El plan
debe cubrir el **"Hecho cuando"** de la issue (es lo que se verificará al final) y los `⚠️` del
cuerpo.

## 4. Implementar y verificar

- Seguir las convenciones del `CLAUDE.md` (capas, naming, comentarios en español).
- `pnpm typecheck && pnpm lint && pnpm test` en verde. Si algo falla y no es de este cambio,
  decirlo con la salida; no taparlo.
- Verificar el **"Hecho cuando"** tal como está escrito, en la app real (navegador, daemon,
  CLI…), no solo con tests. Si la verificación toca servicios externos (p. ej. el daemon real
  sondea la API de Anthropic), preferir una alternativa local.
- Limpiar procesos y pestañas que se hayan abierto para verificar.
- Un daemon lanzado para verificar escucha en `4747`, que puede estar ocupado por otra sesión:
  mirar `ss -ltn` antes, y si lo está, usar otro puerto con `AMNIS_PORT`.

## 5. Commit, push y cerrar la issue

Se commitea en `<rama>` y se integra en `main` sin PR (único contribuyente: la rama aísla el
trabajo en curso, no pide revisión). Mensaje `[#N] - Descripción en español`,
imperativo, con cuerpo si el porqué no es obvio.

```bash
git add -A && git commit                    # en el worktree: solo hay cambios de esta issue
git fetch origin && git rebase origin/main  # si otra sesión pusheó entretanto
pnpm typecheck && pnpm lint && pnpm test    # de nuevo si el rebase trajo commits ajenos
git push origin HEAD:main
gh issue close N -c "Implementado en <sha corto>."
```

- Si el rebase da conflictos, resolverlos aquí (skill `resolving-merge-conflicts`), nunca en el
  árbol principal.
- Si el push se rechaza porque `main` avanzó, repetir fetch + rebase; nada de `--force`.

**Limpieza obligatoria.** En cuanto el push a `main` ha entrado, borrar el worktree y su rama.
Es parte de integrar, no un extra: un worktree olvidado es justo el solape que este paso evita.
También se hace si se paró en §1 por un bloqueo.

```bash
cd /home/termi/amnis-copilot                # salir del worktree antes de borrarlo
git worktree remove ../amnis-copilot-N
git branch -D <rama>                          # -D: tras el rebase el SHA ya no es ancestro de la rama
git worktree prune
git pull --ff-only                          # solo si el árbol principal está limpio
git worktree list                           # comprobar: no debe quedar amnis-copilot-N
```

- `git worktree remove` se niega si quedan cambios sin commitear: no forzarlo, mirarlos antes.
- Antes de `branch -D`, comprobar que el commit está en `origin/main`
  (`git branch -r --contains <sha>`); si no, el push no entró y no se borra nada.
- Procesos (daemon de verificación, `pnpm dev`) y pestañas abiertos desde el worktree se cierran
  antes de borrarlo (§4).

## 6. Revisar las issues superiores (no saltarse)

Subir por la cadena de ancestros, de la más cercana a la épica:

```bash
gh api repos/:owner/:repo/issues/P/sub_issues -q '.[] | "#\(.number) \(.state)"'
```

- Quedan hijas abiertas → el ancestro **sigue abierto**; anotar cuáles faltan.
- Todas cerradas → leer el **"Hecho cuando"** del ancestro (en seguimientos y épicas es un
  resultado de producto). Si se puede comprobar, comprobarlo y cerrarla con un comentario que
  lo diga; si no, **no cerrarla** y preguntar al usuario. Después, repetir con su propio padre.
- Mirar también qué issues bloqueaba N (`blocking`): ahora pueden estar listas; mencionarlas.

## 7. Informe final

Qué se hizo, qué se verificó y cómo, y el estado de la cadena (p. ej. «#80 cerrada · #76 sigue
abierta, falta #81 · #75 abierta»). Lo que no se cubrió o se dejó fuera de alcance, dicho
explícitamente. Decir también que el worktree y `<rama>` están borrados (resultado de
`git worktree list`).
