#!/bin/sh
# Lays a music track under a rendered video, in place of any audio it has:
# trimmed to the video (or, when shorter, run into a copy of itself), faded
# in over 0.6 s and out over the last 2.5 s,
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
OUT=$(awk -v d="$D" 'BEGIN { printf "%.3f", d - 2.5 }')
SHAPE="atrim=0:$D,afade=t=in:st=0:d=0.6,afade=t=out:st=$OUT:d=2.5,loudnorm=I=-14:TP=-1.5:LRA=11"

tmp="${out%.mp4}.music-tmp.mp4"
if awk -v d="$D" -v t="$T" 'BEGIN { exit !(t < d) }'; then
  # Shorter than the picture: the track runs into a second copy of itself,
  # its end crossfaded over 3 s into its start, rather than going silent.
  echo "music: $(basename "$track") is ${T}s, under the ${D}s video; it runs into itself" >&2
  "$FFMPEG" -y -loglevel error -i "$video" -i "$track" -i "$track" \
    -filter_complex "[1:a][2:a]acrossfade=d=3:c1=tri:c2=tri,$SHAPE[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$tmp"
else
  "$FFMPEG" -y -loglevel error -i "$video" -i "$track" \
    -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -af "$SHAPE" -movflags +faststart "$tmp"
fi
mv "$tmp" "$out"
echo "music: $out, $(basename "$track") under ${D}s" >&2
