#!/bin/sh
# The listing's thumbnail and gallery stills, cut from the rendered video:
#   scripts/demo/reel/stills.sh [demo.mp4]
# Writes thumbnail.gif (240x240, the diagram appearing) and gallery-1..4.png
# (1270x760: the diagram, the arrow's document, the trail, Share) beside the
# video, at moments when the camera is zoomed back out. The times are where
# the beats land in the current script; the render prints them, so adjust
# here if they move.
set -eu
video=${1:-scripts/demo/out/demo.mp4}
out=$(dirname "$video")
ffmpeg=${REELSCRIPT_FFMPEG:-ffmpeg}

# The square is the middle of the window, where the diagram is.
"$ffmpeg" -y -loglevel error -ss "${THUMB_AT:-7.4}" -t 3 -i "$video" \
  -vf "crop=900:900:422:40,scale=240:240:flags=lanczos,fps=20,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 "$out/thumbnail.gif"

# 1270x760 is 1.67:1; the frame is 1424x992, so the menu bar and a strip of
# desktop go.
i=1
for t in ${GALLERY_AT:-10.8 28.9 35.0 45.6}; do
  "$ffmpeg" -y -loglevel error -ss "$t" -i "$video" -frames:v 1 \
    -vf "crop=1424:852:0:60,scale=1270:760:flags=lanczos" "$out/gallery-$i.png"
  i=$((i + 1))
done
ls -la "$out"/thumbnail.gif "$out"/gallery-*.png
