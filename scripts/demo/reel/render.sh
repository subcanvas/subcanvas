#!/bin/sh
# Renders the launch demo to scripts/demo/out/demo.mp4 (`pnpm demo:reel`).
# Uses the reelscript CLI named by $REELSCRIPT, else the one on PATH, else
# the published package through npx. See README.md beside this file.
#
# The render has no sound. With DEMO_MUSIC set to an audio file, that track
# is laid under it afterwards (music.sh): trimmed to the video, faded in
# and out, and normalised to -14 LUFS.
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

if [ -n "${DEMO_MUSIC:-}" ] && [ ! -f "$DEMO_MUSIC" ]; then
  echo "render: DEMO_MUSIC is $DEMO_MUSIC, which is not a file" >&2
  exit 1
fi

mkdir -p scripts/demo/out
$CLI render scripts/demo/reel/demo.ts --out scripts/demo/out/demo.mp4

if [ -n "${DEMO_MUSIC:-}" ]; then
  sh scripts/demo/reel/music.sh scripts/demo/out/demo.mp4 "$DEMO_MUSIC" scripts/demo/out/demo.mp4
fi
