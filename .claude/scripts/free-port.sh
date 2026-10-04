#!/usr/bin/env bash
# Primer puerto TCP libre desde el del daemon (4747), por si otra sesión ya tiene uno
# escuchando. Se usa con AMNIS_PORT.
#
# Uso: AMNIS_PORT=$(free-port.sh) node packages/daemon/src/…
set -euo pipefail

# Se sondea conectando, como daemon_alive() de la mascota: `ss` no existe en Git Bash.
# Node está garantizado en el repo y se comporta igual en Linux, macOS y Windows.
in_use() {
  node -e '
    const s = require("node:net").connect(Number(process.argv[1]), "127.0.0.1");
    s.on("connect", () => process.exit(0));
    s.on("error", () => process.exit(1));
  ' "$1"
}

port=${1:-4747}
while in_use "$port"; do
  port=$((port + 1))
done
echo "$port"
