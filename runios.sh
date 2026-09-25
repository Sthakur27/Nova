#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
node scripts/stop-dev.mjs
if [[ "${1:-}" == "--standalone" ]]; then
  shift
  # Bundle the interface even in a debug build, so the installed app works
  # without Vite or a network connection to this Mac.
  exec npm run ios:build -- --debug --open "$@"
fi
exec npm run ios:dev -- --open --host "$@"
