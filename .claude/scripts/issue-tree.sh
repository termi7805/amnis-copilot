#!/usr/bin/env bash
# Jerarquía de la issue N según los sub-issues y dependencias nativos de GitHub: bloqueos,
# issues a las que bloquea y cadena de ancestros (tarea → seguimiento → épica) con el estado
# de las hijas de cada uno.
#
# Uso: issue-tree.sh N               informe legible; sale con 2 si algún blocked_by sigue abierto
#      issue-tree.sh N --ancestors   solo los números de los ancestros, del más cercano a la épica
set -euo pipefail
source "$(dirname "$0")/lib.sh"

n=$(issue_number "${1:-}")
mode=${2:-}

# Imprime los ancestros de N, uno por línea. El endpoint /parent da 404 al llegar arriba.
ancestors() {
  local child=$1 out
  while true; do
    if ! out=$(gh api "repos/:owner/:repo/issues/$child/parent" -q .number 2>&1); then
      [[ $out == *"Not Found"* || $out == *"404"* ]] && return 0
      die "gh api /issues/$child/parent: $out"
    fi
    echo "$out"
    child=$out
  done
}

if [[ $mode == --ancestors ]]; then
  ancestors "$n"
  exit 0
fi
[[ -z $mode ]] || die "opción desconocida: $mode"

line='"#\(.number) \(.state | ascii_downcase) — \(.title)"'

echo "#$n $(gh issue view "$n" --json state,title -q '"\(.state | ascii_downcase) — \(.title)"')"

echo
echo "Bloqueada por:"
blocked=$(gh api --paginate "repos/:owner/:repo/issues/$n/dependencies/blocked_by" -q ".[] | $line")
echo "${blocked:-  (nada)}" | sed 's/^#/  #/'

echo
echo "Bloquea a:"
blocking=$(gh api --paginate "repos/:owner/:repo/issues/$n/dependencies/blocking" -q ".[] | $line")
echo "${blocking:-  (nada)}" | sed 's/^#/  #/'

echo
echo "Ancestros:"
parents=$(ancestors "$n")
[[ -n $parents ]] || echo "  (ninguno)"
for p in $parents; do
  echo "  #$p $(gh issue view "$p" --json state,title -q '"\(.state | ascii_downcase) — \(.title)"')"
  gh api --paginate "repos/:owner/:repo/issues/$p/sub_issues" -q ".[] | $line" | sed 's/^/      /'
done

if grep -q '^#[0-9]* open ' <<<"$blocked"; then
  echo
  echo "✗ #$n tiene bloqueos abiertos" >&2
  exit 2
fi
