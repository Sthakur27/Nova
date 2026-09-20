#!/bin/sh
# Xcode launched from Finder does not inherit the terminal's Node/Rust PATH.
export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v npm >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh" --no-use
    nvm use default --silent || exit 1
  fi
fi
exec npm run -- tauri ios xcode-script "$@"
