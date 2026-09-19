#!/usr/bin/env bash
# Check the app users actually receive, without modifying or launching it.
set -euo pipefail

if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo 'Usage: bash scripts/verify-macos-installer.sh <Nova.dmg>' >&2
  exit 1
fi

mount_dir=$(mktemp -d "${TMPDIR:-/tmp}/nova-verify.XXXXXX")
mounted=false
cleanup() {
  if [[ "$mounted" == true ]]; then
    hdiutil detach "$mount_dir" -quiet || return 1
  fi
  rmdir "$mount_dir"
}
trap cleanup EXIT

hdiutil attach "$1" -readonly -nobrowse -mountpoint "$mount_dir" -quiet
mounted=true
codesign --verify --deep --strict --verbose=2 "$mount_dir/Nova.app"
echo 'Packaged Nova.app signature is valid (Apple notarization is not implied).'
