#!/bin/sh
# amnis-hook: el nombre en la ruta del comando es la marca de identidad que
# install-hooks / uninstall-hooks usan para reconocer lo propio.
#
# Fire-and-forget: PreToolUse con matcher "*" dispara en cada llamada a
# herramienta, así que este script está en la ruta crítica del agente. Si
# bloquea, degrada la herramienta que Amnis pretende acompañar. El fallo
# aceptable es perder un evento, nunca hacer esperar a Claude Code.
payload=$(cat)
[ -z "$payload" ] && exit 0

printf '%s' "$payload" | curl -sS -X POST \
  "http://127.0.0.1:${AMNIS_PORT:-4747}/api/hook/claude" \
  --connect-timeout 0.5 --max-time 1.5 \
  -H "Content-Type: application/json" \
  --data-binary @- >/dev/null 2>&1 || true

exit 0
