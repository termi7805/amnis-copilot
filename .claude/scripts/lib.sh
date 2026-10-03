# Utilidades comunes de los scripts de .claude/scripts/. Se carga con `source`, no se ejecuta.

die() {
  echo "✗ $*" >&2
  exit 1
}

# Valida que $1 es un número de issue.
issue_number() {
  [[ ${1:-} =~ ^[0-9]+$ ]] || die "número de issue no válido: '${1:-}'"
  echo "$1"
}

# Raíz del árbol principal, se llame desde él o desde cualquier worktree.
main_tree() {
  dirname "$(git rev-parse --path-format=absolute --git-common-dir)"
}

# Directorio del worktree de la issue N: hermano del árbol principal.
worktree_dir() {
  echo "$(dirname "$(main_tree)")/amnis-copilot-$1"
}

# Ramas locales y remotas que empiezan por "N-".
issue_branches() {
  git -C "$(main_tree)" for-each-ref --format='%(refname:short)' \
    "refs/heads/$1-*" "refs/remotes/origin/$1-*"
}
