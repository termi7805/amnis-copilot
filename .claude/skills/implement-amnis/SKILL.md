---
name: implement-amnis
description: Implementa una issue del backlog de Amnis de principio a fin — asigna la issue y sus issues superiores, planifica, implementa, verifica, commitea en main, hace push, cierra la issue y cierra las superiores que queden completas. Usar cuando el usuario pida implementar/empezar la issue #N.
argument-hint: <número de issue>
---

# /implement-amnis

Flujo completo para una issue del backlog. Invocar la skill con un número de issue autoriza
commit en `main`, `git push` y cerrar la issue (y las superiores que queden completas). Nada
más sale de la máquina sin que el usuario lo pida.

El argumento es el número de la issue (`/implement-amnis 80`). Sin él, pedirlo.

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

## 5. Commit, push y cerrar la issue

Directamente sobre `main`, sin ramas ni PRs. Mensaje `[#N] - Descripción en español`, imperativo,
con cuerpo si el porqué no es obvio.

```bash
git add -A && git commit && git push
gh issue close N -c "Implementado en <sha corto>."
```

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
explícitamente.
