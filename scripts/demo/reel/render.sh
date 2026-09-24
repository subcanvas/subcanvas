#!/bin/sh
# Renders the launch demo to scripts/demo/out/demo.mp4 (`pnpm demo:reel`).
# Uses the reelscript CLI named by $REELSCRIPT, else the one on PATH, else
# the published package through npx. See README.md beside this file.
set -eu
cd "$(dirname "$0")/../../.."

CLI=${REELSCRIPT:-}
if [ -z "$CLI" ]; then
  if command -v reelscript >/dev/null 2>&1; then
    CLI=reelscript
  else
    CLI="npx --yes @reelscript/cli"
  fi
fi

mkdir -p scripts/demo/out
exec $CLI render scripts/demo/reel/demo.ts --out scripts/demo/out/demo.mp4
