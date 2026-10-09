#!/bin/sh
# Movie night's programme: our own films, as muted 12 fps frames (share/tv/<name>/f0001.jpg ...).
cd "$(dirname "$0")"
reel() {  # reel <name> <video>
  [ -f "$2" ] || { echo "skip $1: no $2"; return; }
  mkdir -p "share/tv/$1" && ffmpeg -v error -y -i "$2" -vf "fps=12,scale=448:252" -q:v 4 "share/tv/$1/f%04d.jpg" && echo "$1: $(ls "share/tv/$1" | wc -l) frames"
}
reel "Load Up Haiku" "$HOME/git/bc1/out/bloomcore_v6.mp4"
reel "Load Up Opus" "$HOME/git/bc2/out/bc2_v1.mp4"
