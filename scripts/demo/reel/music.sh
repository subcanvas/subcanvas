#!/bin/sh
# Lays a music track under a rendered video, in place of any audio it has:
# trimmed to the video, faded in over 0.6 s and out over the last 2.5 s,
# and normalised to -14 LUFS (what YouTube and most players aim for). The
# picture is copied, not encoded again.
#
#   sh scripts/demo/reel/music.sh <video.mp4> <track> <out.mp4>
#
# render.sh runs it after the render when DEMO_MUSIC is set; run it alone to
# put another track under the same cut. Needs ffmpeg and ffprobe.
set -eu
video=$1 track=$2 out=$3
FFMPEG=${REELSCRIPT_FFMPEG:-ffmpeg}
FFPROBE=${FFPROBE:-ffprobe}

# The picture's length, not the file's: a video that already has music can
# hold a few hundredths of a second more of it.
D=$("$FFPROBE" -v error -select_streams v:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "$video")
T=$("$FFPROBE" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$track")
if awk -v d="$D" -v t="$T" 'BEGIN { exit !(t < d) }'; then
  echo "music: $track is ${T}s, shorter than the ${D}s video; the end would be silent" >&2
  exit 1
fi
OUT=$(awk -v d="$D" 'BEGIN { printf "%.3f", d - 2.5 }')

tmp="${out%.mp4}.music-tmp.mp4"
"$FFMPEG" -y -loglevel error -i "$video" -i "$track" \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k \
  -af "atrim=0:$D,afade=t=in:st=0:d=0.6,afade=t=out:st=$OUT:d=2.5,loudnorm=I=-14:TP=-1.5:LRA=11" \
  -movflags +faststart "$tmp"
mv "$tmp" "$out"
echo "music: $out, $(basename "$track") under ${D}s" >&2
