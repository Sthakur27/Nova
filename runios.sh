#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
mode=standalone
case "${1:-}" in
  --live) mode=live; shift ;;
  --standalone) shift ;;
  --help|-h)
    echo "Usage: ./runios.sh [--standalone|--live] [Tauri arguments...]"
    echo "Default: bundle the interface for use away from your Mac."
    echo "--live: use the Mac development server for live updates."
    exit 0
    ;;
esac
node scripts/stop-dev.mjs
if [[ "$mode" == live ]]; then
  echo "Nova live development: your iPhone must be able to reach this Mac."
  exec npm run ios:dev -- --open --host "$@"
fi
# Bundle the interface even in a debug build, so the installed app works
# without Vite or a network connection to this Mac.
echo "Nova standalone install: select your iPhone in Xcode and click Run (not just Build)."
exec npm run ios:build -- --debug --open "$@"
