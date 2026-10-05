#!/bin/sh
# Valida una skin con el validador de Amnis (el mismo que usa la mascota) y
# revisa el contenido de sus SVG. Trabaja sobre su salida, no sobre la lectura
# del manifest: así lo que dice la skill y lo que acepta Amnis no divergen.
#
# Uso: check.sh <carpeta-de-la-skin>
#
# Validador, la primera vía que exista:
#   1. $AMNIS_CLI           comando completo, p. ej. "node /ruta/packages/daemon/src/cli.ts"
#   2. el repo de Amnis     si se ejecuta desde dentro de su árbol
#   3. `amnis` en el PATH
#   4. el daemon en marcha  GET /api/skins/<id> (la skin tiene que estar en ~/.amnis/skins/)
# Sale con código ≠ 0 si hay errores; los avisos no lo cambian.
set -u

dir=${1:-}
if [ -z "$dir" ] || [ ! -d "$dir" ]; then
  echo "Uso: check.sh <carpeta-de-la-skin>" >&2
  exit 2
fi
here=$(cd "$(dirname "$0")" && pwd)
status=0

repo_cli=""
root=$(git -C "$here" rev-parse --show-toplevel 2>/dev/null || true)
if [ -n "$root" ] && [ -f "$root/packages/daemon/src/cli.ts" ]; then
  repo_cli="$root/packages/daemon/src/cli.ts"
fi

echo "── amnis skin check ──"
if [ -n "${AMNIS_CLI:-}" ]; then
  echo "(validador: \$AMNIS_CLI)"
  # shellcheck disable=SC2086
  $AMNIS_CLI skin check "$dir" || status=1
elif [ -n "$repo_cli" ]; then
  echo "(validador: el repo de Amnis)"
  node "$repo_cli" skin check "$dir" || status=1
elif command -v amnis >/dev/null 2>&1; then
  echo "(validador: amnis del PATH)"
  amnis skin check "$dir" || status=1
else
  id=$(basename "$(cd "$dir" && pwd)")
  port=${AMNIS_PORT:-4747}
  echo "(validador: el daemon en 127.0.0.1:$port, GET /api/skins/$id)"
  body=$(curl -sS --max-time 5 -w '\n%{http_code}' "http://127.0.0.1:$port/api/skins/$id" 2>&1) || {
    echo "✗ no hay validador: sin \$AMNIS_CLI, ni repo, ni \`amnis\` en el PATH, y el daemon no responde." >&2
    echo "  Abre Amnis (el daemon valida con su propio código) o define AMNIS_CLI." >&2
    exit 1
  }
  code=$(printf '%s' "$body" | tail -n 1)
  json=$(printf '%s' "$body" | sed '$d')
  case "$code" in
    200) echo "✓ $id: el daemon la carga" ;;
    422) status=1 ;;
    404)
      echo "✗ el daemon no ve ${id}: la skin tiene que estar en ~/.amnis/skins/$id" >&2
      exit 1
      ;;
    *)
      echo "✗ respuesta inesperada del daemon ($code)" >&2
      exit 1
      ;;
  esac
  if command -v node >/dev/null 2>&1; then
    printf '%s' "$json" | node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        const r = JSON.parse(s);
        for (const e of r.errors ?? []) console.log("✗ " + e);
        for (const w of r.warnings ?? []) console.log("⚠ " + w);
      });'
  else
    printf '%s\n' "$json"
  fi
fi

echo "── SVG de las capas ──"
if command -v node >/dev/null 2>&1; then
  node "$here/lint-svg.mjs" "$dir" || status=1
else
  echo "(sin node: no se revisan los SVG; evita scripts, recursos externos y filtros)"
fi

if [ "$status" -eq 0 ]; then
  echo "✓ skin correcta"
else
  echo "✗ la skin tiene errores"
fi
exit "$status"
