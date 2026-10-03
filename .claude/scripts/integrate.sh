#!/usr/bin/env bash
# Integra la rama actual en main sin PR: rebase sobre origin/main, check.sh de nuevo si el
# rebase trajo commits ajenos, y push a main. Imprime el SHA corto integrado en la última línea.
#
# Si el rebase da conflictos, se para con el rebase en curso para resolverlo en el worktree.
# Si el push se rechaza porque main avanzó, basta con volver a lanzarlo. Nunca usa --force.
#
# Uso (desde el worktree, con los cambios ya commiteados): integrate.sh
set -euo pipefail
source "$(dirname "$0")/lib.sh"

branch=$(git symbolic-ref --short HEAD)
[[ $branch != main ]] || die "estás en main: se integra desde la rama de la issue"
[[ -z $(git status --porcelain) ]] || die "hay cambios sin commitear"

git fetch origin
base=$(git merge-base HEAD origin/main)

if ! git rebase origin/main; then
  die "conflictos en el rebase: resolverlos aquí (skill resolving-merge-conflicts) y relanzar"
fi

[[ $(git rev-list --count origin/main..HEAD) -gt 0 ]] || die "no hay commits que integrar"

if [[ $base != $(git rev-parse origin/main) ]]; then
  echo "El rebase trajo commits ajenos: se repite la verificación."
  "$(dirname "$0")/check.sh"
fi

git push origin HEAD:main || die "push rechazado (main avanzó): relanzar integrate.sh"

git rev-parse --short HEAD
