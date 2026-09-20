#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
node scripts/stop-dev.mjs
exec npm run ios:dev -- --open --host "$@"
