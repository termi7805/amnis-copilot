#!/usr/bin/env bash
# Asigna al usuario la issue N y todos sus ancestros. Idempotente.
#
# Uso: assign-chain.sh N
set -euo pipefail
source "$(dirname "$0")/lib.sh"

n=$(issue_number "${1:-}")

for i in "$n" $("$(dirname "$0")/issue-tree.sh" "$n" --ancestors); do
  gh issue edit "$i" --add-assignee @me >/dev/null
  echo "✓ #$i asignada"
done
