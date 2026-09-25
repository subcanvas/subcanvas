#!/bin/sh
# The listing's thumbnail and gallery stills, cut from the rendered video:
#   scripts/demo/reel/stills.sh [demo.mp4]
# Writes thumbnail.gif (240x240, the diagram appearing) and gallery-1..4.png
# (1270x760: the diagram, the whiteboard inside a box, the trail, the
# arrow's document) beside the video, at moments when the camera is still.
# The times are where the beats land in the current script; the render
# prints them, so adjust here if they move.
set -eu
video=${1:-scripts/demo/out/demo.mp4}
out=$(dirname "$video")
ffmpeg=${REELSCRIPT_FFMPEG:-ffmpeg}

# The video is 1920x1080 and the camera centres the diagram while it holds
# on it, so the square is the middle of the frame.
"$ffmpeg" -y -loglevel error -ss "${THUMB_AT:-5.9}" -t 2.6 -i "$video" \
  -vf "crop=1000:1000:460:40,scale=240:240:flags=lanczos,fps=20,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 "$out/thumbnail.gif"

# 1270x760 is 1.67:1. Below the menu bar, 1748x1046 of the frame holds the
# whole window with a thin edge of desktop around it.
i=1
for t in ${GALLERY_AT:-9.3 17.8 24.5 34.5}; do
  "$ffmpeg" -y -loglevel error -ss "$t" -i "$video" -frames:v 1 \
    -vf "crop=1748:1046:86:34,scale=1270:760:flags=lanczos" "$out/gallery-$i.png"
  i=$((i + 1))
done
ls -la "$out"/thumbnail.gif "$out"/gallery-*.png
