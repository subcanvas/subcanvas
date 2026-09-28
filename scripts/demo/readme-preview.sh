#!/usr/bin/env bash
# The README's demo: the rendered video as an animated WebP, which GitHub
# plays inline and without a click (it shows no <video>). 960 pixels wide
# at 12 frames a second keeps the 49-second cut near 2.3 MB.
#
#   scripts/demo/readme-preview.sh [scripts/demo/out/demo.mp4]
#
# Needs ffmpeg and img2webp (brew install ffmpeg webp).
set -euo pipefail
in="${1:-scripts/demo/out/demo.mp4}"
out="docs/media/demo.webp"
frames="$(mktemp -d)"
trap 'rm -rf "$frames"' EXIT
ffmpeg -v error -i "$in" -vf "fps=12,scale=960:-2:flags=lanczos" "$frames/f%04d.png"
img2webp -loop 0 -lossy -q 55 -m 4 -mixed -d 83 "$frames"/f*.png -o "$out" >/dev/null
echo "$out: $(du -h "$out" | cut -f1)"
