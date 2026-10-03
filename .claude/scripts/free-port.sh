#!/usr/bin/env bash
# Primer puerto TCP libre desde el del daemon (4747), por si otra sesión ya tiene uno
# escuchando. Se usa con AMNIS_PORT.
#
# Uso: AMNIS_PORT=$(free-port.sh) node packages/daemon/src/…
set -euo pipefail

port=${1:-4747}
while ss -ltnH "sport = :$port" | grep -q .; do
  port=$((port + 1))
done
echo "$port"
