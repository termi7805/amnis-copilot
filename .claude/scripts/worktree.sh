#!/usr/bin/env bash
# Ciclo de vida del worktree de una issue: ../amnis-copilot-N con la rama N-<descripcion>.
#
# --open N <descripcion>
#                   Crea el worktree con la rama N-<descripcion> nacida de origin/main e
#                   instala dependencias. Se niega si el directorio o una rama N-* ya existen:
#                   son de otra sesión o de un intento anterior y no se pisan.
#                   descripcion: 2–5 palabras en minúsculas, sin tildes, con guiones.
#
# --close N         Borra el worktree y su rama tras comprobar que todo lo de la rama está en
#                   origin/main (vale también si se paró antes de commitear: la rama no tiene
#                   nada propio), y actualiza el árbol principal si está limpio. No fuerza
#                   nada: con cambios sin commitear o commits fuera de origin/main, se para.
#                   Se lanza desde el árbol principal, nunca desde dentro del worktree.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

usage="Uso: worktree.sh --open N <descripcion> | --close N"

open() {
  local n descripcion dir branch existing
  n=$(issue_number "${1:-}")
  descripcion=${2:-}
  [[ $descripcion =~ ^[a-z0-9]+(-[a-z0-9]+){1,4}$ ]] ||
    die "descripción no válida: '$descripcion' (2–5 palabras en minúsculas, sin tildes, con guiones)"

  dir=$(worktree_dir "$n")
  branch="$n-$descripcion"

  git -C "$(main_tree)" fetch origin --prune
  existing=$(issue_branches "$n")
  if [[ -e $dir || -n $existing ]]; then
    echo "Ya hay trabajo de la issue #$n:" >&2
    [[ -e $dir ]] && echo "  directorio: $dir" >&2
    [[ -n $existing ]] && sed 's/^/  rama: /' <<<"$existing" >&2
    git -C "$(main_tree)" worktree list >&2
    die "no se pisa: preguntar al usuario"
  fi

  git -C "$(main_tree)" worktree add "$dir" -b "$branch" origin/main
  (cd "$dir" && pnpm install --frozen-lockfile)

  echo "✓ worktree: $dir"
  echo "✓ rama: $branch"
}

close() {
  local n main dir branch branches
  n=$(issue_number "${1:-}")
  main=$(main_tree)
  dir=$(worktree_dir "$n")

  [[ $(pwd -P) != "$(realpath -m "$dir")"* ]] ||
    die "estás dentro del worktree: hacer cd $main antes"

  mapfile -t branches < <(git -C "$main" for-each-ref --format='%(refname:short)' "refs/heads/$n-*")
  [[ ${#branches[@]} -le 1 ]] || die "varias ramas $n-*: ${branches[*]} — revisar a mano"
  branch=${branches[0]:-}

  git -C "$main" fetch origin

  if [[ -n $branch ]] && ! git -C "$main" merge-base --is-ancestor "$branch" origin/main; then
    git -C "$main" log --oneline "origin/main..$branch" >&2
    die "$branch tiene commits que no están en origin/main: el push no entró, no se borra nada"
  fi

  if [[ -e $dir ]]; then
    git -C "$main" worktree remove "$dir" ||
      die "el worktree tiene cambios sin commitear: mirarlos antes de borrar"
    echo "✓ worktree $dir borrado"
  fi
  if [[ -n $branch ]]; then
    # -D: tras el rebase la rama no es ancestro de main local, aunque sí de origin/main
    git -C "$main" branch -D "$branch" >/dev/null
    echo "✓ rama $branch borrada"
  fi
  git -C "$main" worktree prune

  if [[ -z $(git -C "$main" status --porcelain) ]]; then
    git -C "$main" pull --ff-only
  else
    echo "Árbol principal con cambios: no se hace pull."
  fi

  echo
  git -C "$main" worktree list
  if git -C "$main" worktree list | grep -q "amnis-copilot-$n "; then
    die "sigue registrado un worktree amnis-copilot-$n"
  fi
}

case ${1:-} in
  --open) shift; open "$@" ;;
  --close) shift; close "$@" ;;
  *) die "$usage" ;;
esac
