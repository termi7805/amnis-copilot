#!/usr/bin/env bash
# Typecheck, lint y tests del árbol desde el que se llama (principal o worktree).
#
# Uso: check.sh
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
pnpm typecheck
pnpm lint
pnpm test
echo "✓ typecheck, lint y tests en verde"
